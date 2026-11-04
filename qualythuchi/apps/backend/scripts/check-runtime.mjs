import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

try {
  // Resolve the exact workerd used by Wrangler, including nested npm installs.
  const require = createRequire(import.meta.url);
  const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
  const miniflareRequire = createRequire(wranglerRequire.resolve('miniflare'));
  const workerd = miniflareRequire('workerd');
  const binary = typeof workerd === 'string' ? workerd : workerd.default;
  if (typeof binary !== 'string') throw new Error('Cannot resolve the installed workerd binary.');

  console.log(`Checking workerd on ${process.platform}/${process.arch} (Node ${process.version})`);
  const result = spawnSync(binary, ['--version'], { stdio: 'inherit', timeout: 15000 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (process.platform === 'linux') {
      console.error('Check the native loader error above. The Docker image must include glibc >= 2.35, libc++1 and libatomic1.');
    }
    throw new Error(`workerd could not execute (exit=${result.status}, signal=${result.signal ?? 'none'}).`);
  }
  console.log('workerd binary can execute. Worker configuration is checked when Wrangler starts.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'workerd binary check failed.');
  process.exitCode = 1;
}
