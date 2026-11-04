import { setTimeout as sleep } from 'node:timers/promises';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateVersion(value) {
  if (!uuid.test(value ?? '')) throw new Error('A complete Worker version UUID is required.');
  return value;
}

export function previewTarget(env, main, template) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = env.PREVIEW_D1_DATABASE_ID;
  const worker = env.PREVIEW_WORKER_NAME || 'thu-chi-preview';
  const database = env.PREVIEW_DATABASE_NAME || 'thu-chi-preview';
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '')) throw new Error('CLOUDFLARE_ACCOUNT_ID must contain 32 hexadecimal characters.');
  if (!uuid.test(databaseId ?? '') || databaseId.startsWith('00000000-')) throw new Error('PREVIEW_D1_DATABASE_ID must be a real D1 UUID.');
  for (const name of [worker, database]) {
    if (!/^[a-z][a-z0-9-]{1,53}-preview$/.test(name)) throw new Error('Preview Worker and database names must end in -preview.');
  }
  let origin;
  try { origin = new URL(env.PREVIEW_ORIGIN); } catch { throw new Error('PREVIEW_ORIGIN must be the preview workers.dev HTTPS origin.'); }
  if (origin.protocol !== 'https:' || origin.origin !== env.PREVIEW_ORIGIN || origin.username || origin.password ||
      !origin.hostname.startsWith(`${worker}.`) || !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(origin.hostname)) {
    throw new Error('PREVIEW_ORIGIN must match https://<preview-worker>.<account-subdomain>.workers.dev without a trailing slash.');
  }
  const environments = [main, ...Object.values(main.env ?? {})];
  for (const configured of environments) {
    if (configured.name === worker) throw new Error('Preview must use a separate Worker.');
    for (const db of configured.d1_databases ?? []) {
      if (db.database_id.toLowerCase() === databaseId.toLowerCase() || db.database_name === database) {
        throw new Error('Preview must use a separate D1 database.');
      }
    }
  }
  const config = structuredClone(template);
  config.name = worker;
  config.account_id = accountId;
  config.d1_databases[0].database_id = databaseId;
  config.d1_databases[0].database_name = database;
  return { accountId, databaseId, worker, database, origin: origin.origin, config };
}

export function cloudClient(target, token, transport = fetch) {
  if (!token?.trim()) throw new Error('CLOUDFLARE_API_TOKEN is required.');
  return async (path, { method = 'GET', body, allowMissing = false } = {}) => {
    const response = await transport(`https://api.cloudflare.com/client/v4/accounts/${target.accountId}/${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let payload;
    try { payload = await response.json(); } catch { throw new Error(`Cloudflare returned invalid JSON (HTTP ${response.status}).`); }
    if (allowMissing && (response.status === 404 || payload.errors?.some((error) => error.code === 10007))) return null;
    // Do not print provider bodies: they can contain account details or request data.
    if (!response.ok || payload.success !== true) throw new Error(`Cloudflare ${method} request failed (HTTP ${response.status}).`);
    return payload.result;
  };
}

export const workerPath = (target) => `workers/scripts/${target.worker}`;

export async function activeVersion(api, target, allowMissing = false) {
  const result = await api(`${workerPath(target)}/deployments`, { allowMissing });
  if (result === null) return null;
  const deployment = result.deployments?.[0];
  if (!deployment && allowMissing) return null;
  if (deployment?.versions?.length !== 1 || deployment.versions[0].percentage !== 100) {
    throw new Error('Preview requires one active Worker version at 100%; gradual deployments are unsupported.');
  }
  return validateVersion(deployment.versions[0].version_id);
}

export async function verifyPreview(target, version, transport = fetch, delay = sleep) {
  validateVersion(version);
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      // Credentials are never sent to the public preview host.
      const options = { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) };
      const health = await transport(`${target.origin}/api/health`, options);
      const data = await health.json();
      if (health.status !== 200 || health.headers.get('x-worker-version') !== version ||
          health.headers.get('cache-control') !== 'no-store' || data.status !== 'ok' ||
          data.service !== 'thu-chi-api' || data.environment !== 'test' || data.checks?.database !== 'ok') {
        throw new Error('Preview health/version is not ready.');
      }
      const login = await transport(`${target.origin}/login`, options);
      const html = await login.text();
      if (login.status !== 200 || !login.headers.get('content-type')?.includes('text/html') ||
          !html.includes('/assets/') || html.includes('/@vite/client')) throw new Error('Built preview login is not ready.');
      return;
    } catch {
      if (attempt === 9) throw new Error('Preview failed health, version or app-shell verification after 10 attempts.');
      await delay(3000);
    }
  }
}

export async function rollbackPreview({ api, target, version, verify = verifyPreview }) {
  validateVersion(version);
  // This lookup ensures the version belongs to this isolated Worker before mutation.
  const found = await api(`${workerPath(target)}/versions/${version}`);
  if (found.id !== version) throw new Error('Rollback version does not belong to the preview Worker.');
  await api(`${workerPath(target)}/deployments`, {
    method: 'POST',
    body: { strategy: 'percentage', versions: [{ version_id: version, percentage: 100 }], annotations: { 'workers/message': 'Preview rollback' } }
  });
  if (await activeVersion(api, target) !== version) throw new Error('Rollback deployment does not match the requested version.');
  await verify(target, version);
}

export async function deployPreview({ api, target, run, record, verify = verifyPreview, commit = '' }) {
  const remoteDatabase = await api(`d1/database/${target.databaseId}`);
  if (remoteDatabase.name !== target.database) throw new Error('Remote D1 name does not match the isolated preview database.');
  const previousVersion = await activeVersion(api, target, true);
  const identity = { accountId: target.accountId, worker: target.worker, databaseId: target.databaseId, origin: target.origin };
  record('before', { ...identity, version: previousVersion });
  try {
    await run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', 'wrangler.preview.generated.json']);
    await run(['deploy', '--config', 'wrangler.preview.generated.json']);
    const version = await activeVersion(api, target);
    if (version === previousVersion) throw new Error('Deployment did not publish a new Worker version.');
    await verify(target, version);
    record('release', { ...identity, previousVersion, version, commit, verifiedAt: new Date().toISOString() });
    return version;
  } catch (error) {
    if (previousVersion) {
      try {
        if (await activeVersion(api, target) !== previousVersion) {
          await rollbackPreview({ api, target, version: previousVersion, verify });
          record('recovery', { ...identity, version: previousVersion, verifiedAt: new Date().toISOString() });
        }
      } catch {
        throw new Error('Preview deploy failed and automatic rollback failed. Use the rollback workflow and inspect Cloudflare.');
      }
    }
    throw error;
  }
}

export function previousVersion(snapshot, target) {
  for (const field of ['accountId', 'worker', 'databaseId', 'origin']) {
    if (snapshot[field] !== target[field]) throw new Error('Rollback snapshot belongs to a different preview target.');
  }
  if (!snapshot.version) throw new Error('First deployment has no previous version to restore.');
  return validateVersion(snapshot.version);
}
