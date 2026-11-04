import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '../src/modules/auth/password.ts';
import { hashToken } from '../src/modules/auth/tokens.ts';
import { AUTH_TEST_ACCOUNTS, AUTH_TEST_PASSWORD } from '../test/auth-fixtures.ts';
import { backendDirectory, runWranglerJson } from './wrangler-runner.mjs';

let temporaryFile;
try {
  if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['--local', 'test'])) throw new Error('Auth fixtures can only be seeded with --local test; no dev or remote seeding is supported.');
  const passwordHash = await hashPassword(AUTH_TEST_PASSWORD);
  const now = Date.now();
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const statements = AUTH_TEST_ACCOUNTS.map((account) => `INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at)
    VALUES (${quote(account.id)}, ${quote(account.username)}, ${quote(account.displayName)}, ${quote(account.role)}, ${quote(passwordHash)}, ${now}, ${now})
    ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, is_active = 1, role = excluded.role,
    auth_version = users.auth_version + 1, updated_at = excluded.updated_at;`);
  const keys = [...AUTH_TEST_ACCOUNTS.map((account) => hashToken(`username:${account.username}`)), hashToken('ip:local')];
  statements.push(`DELETE FROM auth_rate_limits WHERE key IN (${keys.map(quote).join(',')});`);
  const directory = resolve(backendDirectory, '.wrangler/fixtures');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const candidate = resolve(directory, `${randomUUID()}.sql`);
  writeFileSync(candidate, statements.join('\n'), { mode: 0o600, flag: 'wx' });
  temporaryFile = candidate;
  const result = runWranglerJson(['d1', 'execute', 'DB', '--local', '--env', 'test', '--persist-to', '.wrangler/test', '--json', '--file', temporaryFile]);
  if (!Array.isArray(result) || !result.length || result.some((entry) => entry.success !== true)) throw new Error('Could not seed local auth test fixtures.');
  console.log('Local test auth fixtures ready. No dev/remote account was changed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Auth fixture setup failed.');
  process.exitCode = 1;
} finally {
  if (temporaryFile) unlinkSync(temporaryFile);
}
