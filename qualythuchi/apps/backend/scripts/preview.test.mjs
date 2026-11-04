import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeVersion, cloudClient, deployPreview, previewTarget, previousVersion, rollbackPreview, verifyPreview } from './preview-core.mjs';

const main = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const template = JSON.parse(readFileSync(new URL('../wrangler.preview.json', import.meta.url), 'utf8'));
const env = {
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  PREVIEW_D1_DATABASE_ID: '12345678-1234-4234-8234-123456789012',
  PREVIEW_ORIGIN: 'https://thu-chi-preview.example.workers.dev'
};
const target = previewTarget(env, main, template);
const oldVersion = '12345678-1234-4234-8234-123456789001';
const newVersion = '12345678-1234-4234-8234-123456789002';

function provider(initial = oldVersion) {
  let active = initial;
  const calls = [];
  return {
    calls,
    setActive(value) { active = value; },
    api: async (path, options = {}) => {
      calls.push({ path, ...options });
      if (path.startsWith('d1/database/')) return { name: target.database };
      if (path.includes('/versions/')) return { id: path.split('/').at(-1) };
      if (options.method === 'POST') { active = options.body.versions[0].version_id; return {}; }
      return active ? { deployments: [{ versions: [{ version_id: active, percentage: 100 }] }] } : null;
    }
  };
}

test('preview configuration isolates cloud state and packages only built assets', () => {
  assert.equal(target.config.vars.APP_ENV, 'test');
  assert.equal(target.config.assets.directory, '../frontend/dist');
  assert.equal(target.config.assets.not_found_handling, 'single-page-application');
  assert.deepEqual(target.config.assets.run_worker_first, ['/api', '/api/*', '/auth', '/auth/*']);
  assert.equal(target.config.version_metadata.binding, 'WORKER_VERSION');
  assert.equal(template.d1_databases[0].database_id, '00000000-0000-0000-0000-000000000000');
  const cases = [
    { CLOUDFLARE_ACCOUNT_ID: '' }, { PREVIEW_D1_DATABASE_ID: template.d1_databases[0].database_id },
    { PREVIEW_WORKER_NAME: 'thu-chi-api-prod' }, { PREVIEW_DATABASE_NAME: 'thu-chi-prod' },
    { PREVIEW_ORIGIN: 'http://thu-chi-preview.example.workers.dev' },
    { PREVIEW_ORIGIN: 'https://thu-chi-preview.example.workers.dev/' },
    { PREVIEW_ORIGIN: 'https://thu-chi-preview.example.workers.dev.evil.test' },
    { PREVIEW_ORIGIN: 'https://token@thu-chi-preview.example.workers.dev' }
  ];
  for (const invalid of cases) assert.throws(() => previewTarget({ ...env, ...invalid }, main, template));
  const shared = structuredClone(main);
  shared.env.prod.d1_databases[0].database_id = env.PREVIEW_D1_DATABASE_ID;
  assert.throws(() => previewTarget(env, shared, template), /separate D1/);
});

test('Cloudflare client confines credentials to its API and sanitizes provider errors', async () => {
  const calls = [];
  const api = cloudClient(target, 'test-token', async (url, options) => {
    calls.push({ url, options });
    return Response.json({ success: true, result: { name: target.database } });
  });
  await api(`d1/database/${target.databaseId}`);
  assert.ok(calls[0].url.startsWith('https://api.cloudflare.com/client/v4/accounts/'));
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
  const failed = cloudClient(target, 'test-token', async () => Response.json({ success: false, errors: [{ message: 'sensitive-test-message' }] }, { status: 403 }));
  await assert.rejects(failed('workers/scripts/thu-chi-preview/deployments'), (error) => !error.message.includes('sensitive-test-message') && error.message.includes('403'));
  assert.throws(() => cloudClient(target, ''), /TOKEN/);
});

test('active version handles a first deploy and refuses gradual rollout ambiguity', async () => {
  assert.equal(await activeVersion(async () => null, target, true), null);
  const missing = cloudClient(target, 'test-token', async () => Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 }));
  assert.equal(await activeVersion(missing, target, true), null);
  await assert.rejects(activeVersion(async () => ({ deployments: [{ versions: [{ version_id: oldVersion, percentage: 50 }, { version_id: newVersion, percentage: 50 }] }] }), target), /100%/);
});

test('successful deployment records recoverable versions and migrates only the preview DB', async () => {
  const cloud = provider();
  const commands = [];
  const records = {};
  const verified = [];
  const version = await deployPreview({
    api: cloud.api, target, commit: 'tested-commit',
    record: (name, value) => { records[name] = value; },
    run: (args) => { commands.push(args); if (args[0] === 'deploy') cloud.setActive(newVersion); },
    verify: async (_, id) => { verified.push(id); }
  });
  assert.equal(version, newVersion);
  assert.equal(records.before.version, oldVersion);
  assert.equal(records.release.previousVersion, oldVersion);
  assert.equal(records.release.commit, 'tested-commit');
  assert.deepEqual(commands, [
    ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.preview.generated.json'],
    ['deploy', '--config', 'wrangler.preview.generated.json']
  ]);
  assert.deepEqual(verified, [newVersion]);
});

test('failed new release restores the previous Worker and verifies it without undoing D1', async () => {
  const cloud = provider();
  const verified = [];
  const records = {};
  let migrations = 0;
  await assert.rejects(deployPreview({
    api: cloud.api, target, record: (name, value) => { records[name] = value; },
    run: (args) => { if (args[0] === 'deploy') cloud.setActive(newVersion); else migrations++; },
    verify: async (_, version) => { verified.push(version); if (version === newVersion) throw new Error('new release unhealthy'); }
  }), /new release unhealthy/);
  assert.equal(await activeVersion(cloud.api, target), oldVersion);
  assert.deepEqual(verified, [newVersion, oldVersion]);
  assert.equal(records.recovery.version, oldVersion);
  assert.equal(migrations, 1);
  assert.deepEqual(cloud.calls.find((call) => call.method === 'POST').body.versions, [{ version_id: oldVersion, percentage: 100 }]);
});

test('deployment refuses a mismatched remote database before mutations', async () => {
  let ran = false;
  await assert.rejects(deployPreview({ api: async () => ({ name: 'production-database' }), target, record: () => {}, run: () => { ran = true; } }), /D1 name/);
  assert.equal(ran, false);
});

test('first deployment failure never invents a rollback target', async () => {
  const cloud = provider(null);
  await assert.rejects(deployPreview({
    api: cloud.api, target, record: () => {}, run: () => { throw new Error('deploy failed'); }, verify: async () => {}
  }), /deploy failed/);
  assert.equal(cloud.calls.some((call) => call.method === 'POST'), false);
  assert.throws(() => previousVersion({ ...target, version: null }, target), /First deployment/);
});

test('rollback validates version ownership and target identity before mutation', async () => {
  const cloud = provider();
  await assert.rejects(rollbackPreview({ api: cloud.api, target, version: '--bad-input' }), /UUID/);
  assert.equal(cloud.calls.length, 0);
  await assert.rejects(rollbackPreview({ api: async () => ({ id: newVersion }), target, version: oldVersion }), /does not belong/);
  assert.throws(() => previousVersion({ ...target, worker: 'other-preview', version: oldVersion }, target), /different preview/);
  assert.equal(previousVersion({ ...target, version: oldVersion }, target), oldVersion);
});

test('public preview probe verifies the exact version, D1 readiness and built HTML without credentials', async () => {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/login')) return new Response('<script src="/assets/app-hash.js"></script>', { headers: { 'Content-Type': 'text/html' } });
    return Response.json({ status: 'ok', service: 'thu-chi-api', environment: 'test', checks: { database: 'ok' } }, {
      headers: { 'X-Worker-Version': newVersion, 'Cache-Control': 'no-store' }
    });
  };
  await verifyPreview(target, newVersion, transport, async () => {});
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) => !options.headers && options.redirect === 'error' && options.cache === 'no-store'));
  let attempts = 0;
  await assert.rejects(verifyPreview(target, oldVersion, async (...args) => { attempts++; return transport(...args); }, async () => {}), /10 attempts/);
  assert.equal(attempts, 10);
});
