import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import { app } from './app';
import { sqliteD1 } from '../test/sqlite-d1.mjs';
import { hashPassword } from './modules/auth/password';
import { authErrorResponse } from './modules/auth/handler';
import { requireAuth, requireCsrf, scopeOwner } from './middleware/auth';
import type { AuthEnvironment } from './middleware/auth';

const ORIGIN = 'https://app.example.test';
const PASSWORD = 'integration test password';
let passwordHash: string;
const databases: DatabaseSync[] = [];
beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture() {
  const database = sqliteD1();
  databases.push(database.sql);
  for (const [id, role] of [['user-a', 'USER'], ['user-b', 'USER'], ['admin', 'SUPER_ADMIN']]) database.sql.prepare('INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, id, id, role, passwordHash, Date.now(), Date.now());
  return { ...database, env: { DB: database.db as unknown as D1Database, APP_ENV: 'prod', CORS_ORIGINS: ORIGIN } satisfies Env };
}

function loginRequest(username = 'user-a') {
  return new Request(`${ORIGIN}/auth/login`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD }) });
}

async function signIn(env: Env, username = 'user-a') {
  const response = await app.fetch(loginRequest(username), env);
  expect(response.status).toBe(200);
  const dto = await response.json() as { csrfToken: string };
  return { cookie: response.headers.get('Set-Cookie')!.split(';')[0], dto };
}

describe('real Hono auth and owner guards', () => {
  it('wires auth endpoints and security headers through the application', async () => {
    const { env } = fixture();
    const { cookie, dto } = await signIn(env);
    const me = await app.fetch(new Request(`${ORIGIN}/auth/me`, { headers: { Cookie: cookie } }), env);
    expect(me.status).toBe(200);
    expect(me.headers.get('Cache-Control')).toBe('no-store');
    expect(me.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await me.json()).toMatchObject({ user: { id: 'user-a', role: 'USER' }, csrfToken: dto.csrfToken });
    const logout = await app.fetch(new Request(`${ORIGIN}/auth/logout`, { method: 'POST', headers: { Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': dto.csrfToken, 'Content-Type': 'application/json' }, body: '{}' }), env);
    expect(logout.status).toBe(204);
    expect((await app.fetch(new Request(`${ORIGIN}/auth/me`, { headers: { Cookie: cookie } }), env)).status).toBe(401);
  });

  it('allows self identity and prevents cross-owner/admin access even with forged client roles', async () => {
    const { env } = fixture();
    const { cookie } = await signIn(env);
    expect((await app.fetch(new Request(`${ORIGIN}/api/users/user-a`, { headers: { Cookie: cookie } }), env)).status).toBe(200);
    for (const path of ['/api/users/user-b?role=SUPER_ADMIN', '/api/admin/users']) {
      const response = await app.fetch(new Request(`${ORIGIN}${path}`, { headers: { Cookie: cookie, 'X-Admin-Role': 'SUPER_ADMIN' } }), env);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('password_hash');
    }
    expect((await app.fetch(new Request(`${ORIGIN}/api/users/user-a`), env)).status).toBe(401);
    const admin = await signIn(env, 'admin');
    const list = await app.fetch(new Request(`${ORIGIN}/api/admin/users`, { headers: { Cookie: admin.cookie } }), env);
    expect(list.status).toBe(200);
    const body = await list.text();
    expect(JSON.parse(body).users).toHaveLength(3);
    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('csrfToken');
    expect((await app.fetch(new Request(`${ORIGIN}/api/users/user-b`, { headers: { Cookie: admin.cookie } }), env)).status).toBe(200);
  });

  it('checks origin and preflight before auth database work', async () => {
    const env = { APP_ENV: 'prod', CORS_ORIGINS: ORIGIN, DB: {} } as Env;
    const denied = await app.fetch(new Request(`${ORIGIN}/auth/login`, { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: '{}' }), env);
    expect(denied.status).toBe(403);
    const preflight = await app.fetch(new Request(`${ORIGIN}/auth/logout`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' } }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('enforces CSRF and the route owner before an authenticated write handler executes', async () => {
    const { env } = fixture();
    const { cookie, dto } = await signIn(env);
    const protectedApp = new Hono<AuthEnvironment>();
    protectedApp.onError(authErrorResponse);
    let writes = 0;
    protectedApp.post('/users/:ownerUserId', requireAuth, scopeOwner, requireCsrf, (c) => { writes++; return c.json({ ownerUserId: c.get('ownerUserId') }); });
    const mutation = (id: string, token?: string) => new Request(`${ORIGIN}/users/${id}`, { method: 'POST', headers: { Cookie: cookie, Origin: ORIGIN, ...(token ? { 'X-CSRF-Token': token } : {}) } });
    expect((await protectedApp.fetch(mutation('user-a'), env)).status).toBe(403);
    expect((await protectedApp.fetch(mutation('user-b', dto.csrfToken), env)).status).toBe(403);
    expect(writes).toBe(0);
    expect((await protectedApp.fetch(mutation('user-a', dto.csrfToken), env)).status).toBe(200);
    expect(writes).toBe(1);
  });
});
