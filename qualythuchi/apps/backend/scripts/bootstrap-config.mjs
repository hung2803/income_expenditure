export function bootstrapArgs(args) {
  const [mode, environment, ...extra] = args;
  // Production bootstrap is deliberately not enabled while its procedure is
  // awaiting the owner's decision. No Worker bootstrap endpoint is exposed.
  if (mode !== '--local' || !['dev', 'test'].includes(environment) || extra.length) throw new Error('Use --local dev or --local test. Remote bootstrap is not enabled while the first-admin procedure awaits confirmation.');
  return ['d1', 'execute', 'DB', '--local', '--env', environment, '--persist-to', environment === 'test' ? '.wrangler/test' : '.wrangler/state', '--json'];
}

export function bootstrapSql({ id, username, displayName, passwordHash, now }) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(username) || typeof displayName !== 'string' || !displayName.trim() || displayName.length > 100 || Array.from(displayName).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('Invalid initial account identity.');
  if (!/^scrypt\$v1\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(passwordHash) || !Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid password hash or account timestamp.');
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  return `INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at)
SELECT ${quote(id)}, ${quote(username)}, ${quote(displayName.trim())}, 'SUPER_ADMIN', ${quote(passwordHash)}, ${now}, ${now}
WHERE NOT EXISTS (SELECT 1 FROM users) AND NOT EXISTS (SELECT 1 FROM auth_bootstrap)
RETURNING id;\n`;
}
