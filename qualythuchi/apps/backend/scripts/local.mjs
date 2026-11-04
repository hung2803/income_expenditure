import { runWrangler } from './wrangler-runner.mjs';
import { createLocalArgs } from './local-config.mjs';

const [action, environment, ...extra] = process.argv.slice(2);
try { process.exitCode = runWrangler(createLocalArgs(action, environment, extra)); }
catch (error) { console.error(error instanceof Error ? error.message : 'Could not launch local Wrangler.'); process.exitCode = 1; }
