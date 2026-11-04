import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './sqlite-d1.mjs';
import { hashPassword, verifyPassword, validateNewPassword } from '../src/modules/auth/password.ts';
import { handleAuth } from '../src/modules/auth/handler.ts';
import { authenticate, authorizedOwner, checkCsrf } from '../src/modules/auth/service.ts';
import { hashToken } from '../src/modules/auth/tokens.ts';
import { AuthRepository } from '../src/modules/auth/repository.ts';
import { bootstrapSql } from '../scripts/bootstrap-config.mjs';
import { checkHealth } from '../src/modules/health/service.ts';
import { trustedForwardedOrigin } from '../src/config/proxy-origin.ts';

const PASSWORD = 'correct test password!';
const ORIGIN = 'https://app.example.test';
let passwordHash;
before(async () => { passwordHash = await hashPassword(PASSWORD); });

function fixture() {
  const database = sqliteD1();
  const insert = database.sql.prepare(`INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const [id, role] of [['user-a', 'USER'], ['user-b', 'USER'], ['admin', 'SUPER_ADMIN']]) insert.run(id, id, `Name ${id}`, role, passwordHash, Date.now(), Date.now());
  const env = { DB: database.db, APP_ENV: 'prod', CORS_ORIGINS: ORIGIN };
  return { ...database, env };
}

function request(action, { body, cookie, csrf, origin = ORIGIN, url = ORIGIN, ...overrides } = {}) {
  return new Request(`${url}/auth/${action}`, {
    method: action === 'me' ? 'GET' : 'POST',
    headers: { ...(origin ? { Origin: origin } : {}), ...(action === 'me' ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(action === 'me' ? {} : { body: JSON.stringify(body ?? (action === 'login' ? { username: 'user-a', password: PASSWORD } : {})) }),
    ...overrides
  });
}

async function signIn(f, username = 'user-a', cookie) {
  const response = await handleAuth('login', request('login', { body: { username, password: PASSWORD }, cookie }), f.env);
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('Set-Cookie').split(';')[0], dto: await response.json(), response };
}

test('scrypt uses fresh salts, fixed safe parameters and bounded creation passwords', async () => {
  const second = await hashPassword(PASSWORD);
  assert.notEqual(second, passwordHash);
  assert.match(second, /^scrypt\$v1\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(await verifyPassword(PASSWORD, second), true);
  assert.equal(await verifyPassword('incorrect', second), false);
  assert.equal(await verifyPassword(PASSWORD, second.replace('16384', '999999999')), false);
  assert.equal(await verifyPassword(PASSWORD, null), false);
  for (const length of [0, 7, 26, 128]) {
    assert.throws(() => validateNewPassword('x'.repeat(length)), /8–25 characters/);
    await assert.rejects(hashPassword('x'.repeat(length)), /8–25 characters/);
  }
  for (const password of ['x'.repeat(8), 'x'.repeat(25), '🔐'.repeat(8), '🔐'.repeat(25)]) {
    assert.doesNotThrow(() => validateNewPassword(password));
    assert.equal(await verifyPassword(password, await hashPassword(password)), true);
  }
});

test('migrations enforce roles, unique username, session foreign keys and schema version', () => {
  const f = fixture();
  try {
    assert.equal(f.sql.prepare("SELECT value FROM app_metadata WHERE key = 'schema_version'").get().value, '12');
    assert.throws(() => f.sql.prepare("INSERT INTO auth_roles VALUES ('ADMIN')").run());
    assert.throws(() => f.sql.prepare("UPDATE users SET username = 'USER-A' WHERE id = 'user-b'").run());
    assert.throws(() => f.sql.prepare("INSERT INTO sessions VALUES ('x', 'missing', 1, 1, 2, NULL)").run());
  } finally { f.close(); }
});

test('readiness requires the current finance migration rather than accepting an older schema', async () => {
  const f = fixture();
  try {
    assert.equal((await checkHealth(f.env)).status, 'ok');
    for (const version of ['1', '3']) {
      f.sql.prepare("UPDATE app_metadata SET value = ? WHERE key = 'schema_version'").run(version);
      assert.deepEqual((await checkHealth(f.env)).checks, { database: 'error' });
    }
  } finally { f.close(); }
});

test('first-admin bootstrap is atomic, refuses a second account and cannot reopen after initialization', () => {
  const f = sqliteD1();
  try {
    const account = { id: '12345678-1234-4234-8234-123456789012', username: 'first-admin', displayName: "O'Connor", passwordHash, now: Date.now() };
    assert.equal(f.sql.prepare(bootstrapSql(account)).get().id, account.id);
    assert.equal(f.sql.prepare('SELECT user_id FROM auth_bootstrap').get().user_id, account.id);
    assert.equal(f.sql.prepare('SELECT role FROM users').get().role, 'SUPER_ADMIN');
    assert.equal(f.sql.prepare(bootstrapSql({ ...account, id: '12345678-1234-4234-8234-123456789013', username: 'another-admin' })).get(), undefined);
    assert.equal(f.sql.prepare('SELECT count(*) AS total FROM users').get().total, 1);
    assert.throws(() => f.sql.prepare('DELETE FROM users').run());
  } finally { f.close(); }
});

test('bootstrap refuses to promote an existing account or seed a nonempty database', () => {
  const f = fixture();
  try {
    const sql = bootstrapSql({ id: '12345678-1234-4234-8234-123456789012', username: 'user-a', displayName: 'Replacement', passwordHash, now: Date.now() });
    assert.equal(f.sql.prepare(sql).get(), undefined);
    assert.equal(f.sql.prepare("SELECT role FROM users WHERE id = 'user-a'").get().role, 'USER');
  } finally { f.close(); }
});

test('login issues a host-only secure HttpOnly cookie and persists only a session hash', async () => {
  const f = fixture();
  try {
    const { cookie, dto, response } = await signIn(f);
    assert.match(cookie, /^__Host-thu_chi_session=[\w-]{43}$/);
    for (const flag of ['HttpOnly', 'Secure', 'Path=/', 'SameSite=Lax', 'Max-Age=2592000']) assert.ok(response.headers.get('Set-Cookie').includes(flag));
    assert.ok(!response.headers.get('Set-Cookie').includes('Domain='));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(dto.user, { id: 'user-a', username: 'user-a', displayName: 'Name user-a', role: 'USER' });
    assert.match(dto.csrfToken, /^[a-f0-9]{64}$/);
    const remainingSessionMs = Date.parse(dto.expiresAt) - Date.now();
    assert.ok(remainingSessionMs <= 30 * 24 * 60 * 60 * 1000 && remainingSessionMs > 30 * 24 * 60 * 60 * 1000 - 5000);
    const stored = f.sql.prepare('SELECT token_hash FROM sessions').get();
    assert.equal(stored.token_hash, hashToken(cookie.split('=')[1]));
    assert.ok(!JSON.stringify(stored).includes(cookie.split('=')[1]));
    assert.equal('password_hash' in dto.user, false);
    assert.ok(f.primaryReads() >= 1);
  } finally { f.close(); }
});

test('me returns current server identity, live role and the same CSRF token', async () => {
  const f = fixture();
  try {
    const login = await signIn(f, 'admin');
    const result = await handleAuth('me', request('me', { cookie: login.cookie }), f.env);
    assert.deepEqual(await result.json(), login.dto);
    f.sql.prepare("UPDATE users SET role = 'USER' WHERE id = 'admin'").run();
    const changed = await handleAuth('me', request('me', { cookie: login.cookie }), f.env);
    assert.equal((await changed.json()).user.role, 'USER');
  } finally { f.close(); }
});

test('incorrect password, unknown user and inactive account share one safe error', async () => {
  const f = fixture();
  try {
    f.sql.prepare("UPDATE users SET is_active = 0 WHERE id = 'user-b'").run();
    const errors = [];
    for (const [username, password] of [['user-a', 'wrong'], ['unknown-user', PASSWORD], ['user-b', PASSWORD]]) {
      const response = await handleAuth('login', request('login', { body: { username, password } }), f.env);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('Set-Cookie'), null);
      errors.push(await response.text());
    }
    assert.equal(new Set(errors).size, 1);
    assert.equal(f.sql.prepare('SELECT count(*) AS total FROM sessions').get().total, 0);
  } finally { f.close(); }
});

test('rate limits count normalized usernames atomically and reopen after the window', async () => {
  const f = fixture();
  try {
    const repository = new AuthRepository(f.db);
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: 12 }, () => repository.reserveLogin('user-a', 'same-ip', now)));
    assert.equal(results.filter(Boolean).length, 10);
    assert.equal(await repository.reserveLogin('user-a', 'same-ip', now + 900_000), true);
    for (let index = 0; index < 10; index++) await repository.reserveLogin('user-b', 'same-ip', now);
    const limited = await handleAuth('login', request('login', { body: { username: ' USER-B ', password: PASSWORD } }), f.env);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '900');
  } finally { f.close(); }
});

test('missing, expired, revoked, disabled and version-invalidated sessions cannot authenticate', async () => {
  const f = fixture();
  try {
    const missing = await handleAuth('me', request('me'), f.env);
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).error.code, 'SESSION_COOKIE_MISSING');
    assert.equal(missing.headers.get('Set-Cookie'), null);
    const { cookie: validCookie } = await signIn(f);
    assert.equal((await handleAuth('me', request('me', { cookie: validCookie }), f.env)).status, 200);
    for (const sql of [
      'UPDATE sessions SET expires_at = created_at + 1',
      'UPDATE sessions SET revoked_at = 1',
      "UPDATE users SET is_active = 0 WHERE id = 'user-a'",
      "UPDATE users SET auth_version = auth_version + 1 WHERE id = 'user-a'"
    ]) {
      f.sql.prepare("UPDATE users SET is_active = 1 WHERE id = 'user-a'").run();
      const { cookie } = await signIn(f);
      f.sql.exec(sql);
      const response = await handleAuth('me', request('me', { cookie }), f.env);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'SESSION_NOT_ACTIVE');
      assert.equal(response.headers.get('Set-Cookie'), null);
    }
  } finally { f.close(); }
});

test('login rotates the cookie and revokes the previous session when changing identity', async () => {
  const f = fixture();
  try {
    const a = await signIn(f);
    const b = await signIn(f, 'user-b', a.cookie);
    assert.notEqual(a.cookie, b.cookie);
    assert.equal((await handleAuth('me', request('me', { cookie: a.cookie }), f.env)).status, 401);
    const response = await handleAuth('me', request('me', { cookie: b.cookie }), f.env);
    assert.equal((await response.json()).user.id, 'user-b');
  } finally { f.close(); }
});

test('logout requires exact origin plus CSRF, revokes the DB session, then clears its cookie', async () => {
  const f = fixture();
  try {
    const { cookie, dto } = await signIn(f);
    for (const changes of [{}, { csrf: '0'.repeat(64) }, { csrf: dto.csrfToken, origin: null }, { csrf: dto.csrfToken, origin: 'https://evil.test' }]) {
      const response = await handleAuth('logout', request('logout', { cookie, ...changes }), f.env);
      assert.equal(response.status, 403);
      assert.equal(f.sql.prepare('SELECT revoked_at FROM sessions').get().revoked_at, null);
    }
    const response = await handleAuth('logout', request('logout', { cookie, csrf: dto.csrfToken }), f.env);
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.ok(response.headers.get('Set-Cookie').includes('Max-Age=0'));
    assert.equal((await handleAuth('me', request('me', { cookie }), f.env)).status, 401);
  } finally { f.close(); }
});

test('owner authorization uses the authenticated role and blocks User access to another owner', async () => {
  const f = fixture();
  try {
    const a = await signIn(f);
    const principal = await authenticate(request('me', { cookie: a.cookie }), f.env);
    assert.equal(authorizedOwner(principal, 'user-a'), 'user-a');
    assert.throws(() => authorizedOwner(principal, 'user-b'), (error) => error.status === 403);
    assert.throws(() => checkCsrf(request('logout', { cookie: a.cookie, csrf: 'x' }), f.env, principal), (error) => error.status === 403);
    const admin = await signIn(f, 'admin');
    const adminPrincipal = await authenticate(request('me', { cookie: admin.cookie }), f.env);
    assert.equal(authorizedOwner(adminPrincipal, 'user-b'), 'user-b');
  } finally { f.close(); }
});

test('untrusted origins, non-JSON posts, malformed JSON, oversized bodies and role injection are rejected', async () => {
  const f = fixture();
  try {
    const requests = [
      [request('login', { origin: null }), 403],
      [request('login', { origin: 'https://evil.test' }), 403],
      [request('login', { headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' } }), 415],
      [request('login', { body: '{' }), 400],
      [request('login', { body: { username: 'user-a', password: 'x'.repeat(5000) } }), 413],
      [request('login', { body: { username: 'user-a', password: PASSWORD, role: 'SUPER_ADMIN' } }), 400],
      [request('login', { body: { username: "' OR 1=1 --", password: PASSWORD } }), 400]
    ];
    for (const [input, status] of requests) assert.equal((await handleAuth('login', input, f.env)).status, status);
    assert.equal(f.sql.prepare('SELECT count(*) AS total FROM sessions').get().total, 0);
  } finally { f.close(); }
});

test('transport policy permits local test/dev LAN and requires HTTPS on production/public test', async () => {
  const f = fixture();
  try {
    for (const [environment, url, expected] of [
      ['dev', 'http://192.168.1.12:5173', 200],
      ['test', 'http://127.0.0.1:4173', 200],
      ['test', 'http://public.example.test', 426],
      ['prod', 'http://127.0.0.1:4173', 426]
    ]) {
      const response = await handleAuth('login', request('login', { url, origin: url }), { ...f.env, APP_ENV: environment });
      assert.equal(response.status, expected);
      if (expected === 200) { assert.match(response.headers.get('Set-Cookie'), /^thu_chi_dev_session=/); assert.ok(!response.headers.get('Set-Cookie').includes('; Secure')); }
    }
  } finally { f.close(); }
});

test('a validated HTTPS development tunnel gets a Secure host-only session cookie', async () => {
  const f = fixture();
  try {
    const publicOrigin = 'https://sample.run.pinggy-free.link';
    const headers = {
      Origin: 'http://127.0.0.1:8787',
      'X-Forwarded-Origin': publicOrigin,
      'X-Forwarded-Host': 'sample.run.pinggy-free.link',
      'X-Forwarded-Proto': 'https',
      'Content-Type': 'application/json'
    };
    assert.equal(trustedForwardedOrigin(new Request('http://127.0.0.1:8787/auth/login', { headers }), 'dev'), publicOrigin);
    assert.equal(trustedForwardedOrigin(new Request('http://127.0.0.1:8787/auth/login', { headers }), 'prod'), undefined);
    assert.equal(trustedForwardedOrigin(new Request('http://127.0.0.1:8787/auth/login', { headers: { ...headers, 'X-Forwarded-Host': 'evil.example' } }), 'dev'), undefined);

    const response = await handleAuth('login', new Request('http://127.0.0.1:8787/auth/login', {
      method: 'POST', headers, body: JSON.stringify({ username: 'user-a', password: PASSWORD })
    }), { ...f.env, APP_ENV: 'dev' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Set-Cookie'), /^__Host-thu_chi_session=/);
    assert.ok(response.headers.get('Set-Cookie').includes('; Secure'));
    assert.ok(response.headers.get('Set-Cookie').includes('; HttpOnly'));
  } finally { f.close(); }
});

test('duplicate cookies, forged IDs and internal database errors never disclose credentials', async () => {
  const f = fixture();
  try {
    const { cookie } = await signIn(f);
    assert.equal((await handleAuth('me', request('me', { cookie: `${cookie}; ${cookie}` }), f.env)).status, 401);
    assert.equal((await handleAuth('me', request('me', { cookie: '__Host-thu_chi_session=' + 'a'.repeat(43) }), f.env)).status, 401);
    const response = await handleAuth('me', request('me', { cookie }), { ...f.env, DB: { withSession: () => { throw new Error('password=secret token=secret'); } } });
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('secret'));
  } finally { f.close(); }
});

