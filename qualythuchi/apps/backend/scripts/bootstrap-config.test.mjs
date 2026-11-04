import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapArgs, bootstrapSql } from './bootstrap-config.mjs';

const account = { id: '12345678-1234-4234-8234-123456789012', username: 'admin', displayName: "O'Connor", passwordHash: `scrypt$v1$16384$8$5$${'a'.repeat(32)}$${'b'.repeat(64)}`, now: 1_800_000_000_000 };
test('bootstrap targets only explicitly selected local dev/test state', () => {
  assert.deepEqual(bootstrapArgs(['--local', 'test']), ['d1', 'execute', 'DB', '--local', '--env', 'test', '--persist-to', '.wrangler/test', '--json']);
  for (const args of [[], ['dev'], ['--remote', 'prod'], ['--local', 'prod'], ['--local', 'dev', '--remote'], ['--local', 'dev', 'password']]) assert.throws(() => bootstrapArgs(args));
});
test('bootstrap SQL escapes display names and allows only a bounded, already-hashed credential', () => {
  const sql = bootstrapSql(account);
  assert.ok(sql.includes("O''Connor"));
  assert.ok(sql.includes('NOT EXISTS (SELECT 1 FROM users)'));
  assert.ok(sql.includes('NOT EXISTS (SELECT 1 FROM auth_bootstrap)'));
  assert.throws(() => bootstrapSql({ ...account, passwordHash: 'plaintext-secret' }));
  assert.throws(() => bootstrapSql({ ...account, username: "admin'); DROP TABLE users; --" }));
  assert.throws(() => bootstrapSql({ ...account, displayName: 'bad\u0000name' }));
});
