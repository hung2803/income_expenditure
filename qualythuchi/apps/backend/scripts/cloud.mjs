import { readFileSync } from 'node:fs';
import { validateCloudConfig } from './cloud-config.mjs';
import { runWrangler } from './wrangler-runner.mjs';

const [action, environment, secretName] = process.argv.slice(2);
try {
  if (!['check', 'migrate', 'deploy', 'secret'].includes(action)) {
    throw new Error('Usage: node scripts/cloud.mjs <check|migrate|deploy|secret> <dev|test|prod> [secret-name]');
  }
  if (process.argv.slice(2).length !== (action === 'secret' ? 3 : 2)) throw new Error('Use an explicit environment and, for secrets, the NAME only; do not pass secret values as arguments.');
  if (action === 'secret' && ['APP_ENV', 'CORS_ORIGINS', 'DB'].includes(secretName)) throw new Error('Public configuration and DB binding names cannot be used as secret names.');
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const target = validateCloudConfig(config, environment);
  console.log(`Target: ${target.environment}; Worker: ${target.worker}; D1: ${target.database}`);
  if (action === 'check') {
    console.log('Configuration is ready for Cloudflare commands; no remote resource was changed.');
  } else {
    if (action === 'secret' && !/^[A-Z][A-Z0-9_]*$/.test(secretName ?? '')) throw new Error('Provide a secret NAME only. Wrangler will prompt for its value; never put values in command arguments.');
    const args = action === 'deploy' ? ['deploy', '--env', environment]
      : action === 'migrate' ? ['d1', 'migrations', 'apply', 'DB', '--remote', '--env', environment]
        : ['secret', 'put', secretName, '--env', environment];
    process.exitCode = runWrangler(args);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Cloud command failed.');
  process.exitCode = 1;
}
