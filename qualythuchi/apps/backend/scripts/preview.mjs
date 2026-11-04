import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { backendDirectory, runWrangler } from './wrangler-runner.mjs';
import { activeVersion, cloudClient, deployPreview, previewTarget, previousVersion, rollbackPreview, validateVersion, verifyPreview } from './preview-core.mjs';

try {
  const [action, version, ...extra] = process.argv.slice(2);
  if (!['prepare', 'deploy', 'rollback', 'rollback-before', 'verify'].includes(action) || extra.length ||
      (action === 'rollback' ? !version : Boolean(version))) {
    throw new Error('Usage: node scripts/preview.mjs prepare|deploy|verify|rollback-before|rollback <version-uuid>');
  }
  if (action === 'rollback') validateVersion(version);
  const read = (name) => JSON.parse(readFileSync(resolve(backendDirectory, name), 'utf8'));
  const target = previewTarget(process.env, read('wrangler.jsonc'), read('wrangler.preview.json'));
  const records = resolve(backendDirectory, '../../.preview');
  const record = (name, data) => {
    mkdirSync(records, { recursive: true });
    writeFileSync(resolve(records, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
  };
  if (action === 'prepare' || action === 'deploy') {
    writeFileSync(resolve(backendDirectory, 'wrangler.preview.generated.json'), `${JSON.stringify(target.config, null, 2)}\n`);
  }
  if (action === 'prepare') {
    console.log('Preview configuration validated. No cloud resources changed.');
  } else {
    const api = cloudClient(target, process.env.CLOUDFLARE_API_TOKEN);
    if (action === 'deploy') {
      await deployPreview({ api, target, record, commit: process.env.GITHUB_SHA ?? '', run: (args) => {
        if (runWrangler(args) !== 0) throw new Error('Wrangler preview command failed.');
      } });
    } else if (action === 'verify') {
      await verifyPreview(target, await activeVersion(api, target));
    } else {
      const requested = action === 'rollback' ? version : previousVersion(JSON.parse(readFileSync(resolve(records, 'before.json'), 'utf8')), target);
      await rollbackPreview({ api, target, version: requested });
      record('rollback', { worker: target.worker, origin: target.origin, version: requested, verifiedAt: new Date().toISOString() });
    }
    console.log(`Preview ${action} completed and verified: ${target.origin}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Preview operation failed.');
  process.exitCode = 1;
}
