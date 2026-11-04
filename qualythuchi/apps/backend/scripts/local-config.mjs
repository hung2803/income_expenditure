export function createLocalArgs(action, environment, extra = []) {
  if (!['dev', 'test'].includes(environment) || !['serve', 'migrate', 'check-db'].includes(action)) {
    throw new Error('Select a local action and dev/test environment.');
  }
  const persistTo = environment === 'test' ? '.wrangler/test' : '.wrangler/state';
  if (action !== 'serve') {
    if (extra.length) throw new Error('Local database commands do not accept remote/environment overrides.');
    return action === 'migrate'
      ? ['d1', 'migrations', 'apply', 'DB', '--local', '--env', environment, '--persist-to', persistTo]
      : ['d1', 'execute', 'DB', '--local', '--env', environment, '--persist-to', persistTo, '--command', "SELECT value FROM app_metadata WHERE key = 'schema_version'"];
  }
  const options = { '--ip': '127.0.0.1', '--port': environment === 'test' ? '8788' : '8787' };
  for (let index = 0; index < extra.length; index += 2) {
    const key = extra[index], value = extra[index + 1];
    if (!Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('Only --ip <address> and --port <number> are accepted for local serve.');
    if (key === '--port' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) throw new Error('Invalid local port.');
    options[key] = value;
  }
  return ['dev', '--local', '--env', environment, '--persist-to', persistTo, ...Object.entries(options).flat()];
}
