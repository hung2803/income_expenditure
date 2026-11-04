import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

function invokeWrangler(args, stdio) {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('wrangler/package.json');
  const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
  const binary = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin.wrangler;
  return spawnSync(process.execPath, [resolve(dirname(packagePath), binary), ...args], {
    cwd: backendDirectory,
    stdio,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false' }
  });
}

export function runWrangler(args) {
  const result = invokeWrangler(args, 'inherit');
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function runWranglerJson(args) {
  const result = invokeWrangler(args, ['ignore', 'pipe', 'pipe']);
  // SQL files can contain credential hashes: do not echo raw provider output.
  if (result.error || result.status !== 0) throw new Error('D1 command failed. Check that migrations are applied and the selected local database is available.');
  try { return JSON.parse(result.stdout.toString('utf8')); } catch { throw new Error('D1 did not return valid JSON.'); }
}
