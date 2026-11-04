import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../src/app.ts';
import { hashPassword } from '../src/modules/auth/password.ts';
import { sqliteD1 } from './sqlite-d1.mjs';

const ORIGIN = 'https://app.example.test';
const PASSWORD = 'integration test password';
let database;
let env;
let passwordHash;
before(async () => {
  passwordHash = await hashPassword(PASSWORD);
  database = sqliteD1();
  for (const [id, role] of [['user-a', 'USER'], ['user-b', 'USER'], ['admin', 'SUPER_ADMIN']]) {
    database.sql.prepare('INSERT INTO users(id,username,display_name,role,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, id, id, role, passwordHash, Date.now(), Date.now());
  }
  env = { DB: database.db, APP_ENV: 'prod', CORS_ORIGINS: ORIGIN };
});
after(() => database?.close());

async function signIn(username) {
  const response = await app.fetch(new Request(`${ORIGIN}/auth/login`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD })
  }), env);
  assert.equal(response.status, 200);
  const dto = await response.json();
  return { cookie: response.headers.get('Set-Cookie').split(';')[0], csrf: dto.csrfToken };
}

function api(path, auth, { method = 'GET', body } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(auth ? { Cookie: auth.cookie } : {}),
      ...(auth?.csrf && method !== 'GET' ? { 'X-CSRF-Token': auth.csrf } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

test('User requests to admin APIs receive 403', async () => {
  const user = await signIn('user-a');
  for (const path of ['/api/admin/users', '/api/admin/audit']) {
    const response = await app.fetch(api(path, user), env);
    assert.equal(response.status, 403, path);
  }
});

test('Super Admin can create, edit and deactivate an account while preserving its audit history', async () => {
  const admin = await signIn('admin');
  const denied = await app.fetch(api('/api/admin/users', await signIn('user-a'), {
    method: 'POST', body: { username: 'p06-new-user', displayName: 'New User', password: 'password123' }
  }), env);
  assert.equal(denied.status, 403);
  const createdResponse = await app.fetch(api('/api/admin/users', admin, {
    method: 'POST', body: { username: 'p06-new-user', displayName: 'New User', password: 'password123' }
  }), env);
  assert.equal(createdResponse.status, 201);
  const user = (await createdResponse.json()).user;
  const updatedResponse = await app.fetch(api(`/api/admin/users/${user.id}`, admin, {
    method: 'PUT', body: { displayName: 'Updated User', isActive: true }
  }), env);
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json()).user.displayName, 'Updated User');
  const deleted = await app.fetch(api(`/api/admin/users/${user.id}`, admin, { method: 'DELETE' }), env);
  assert.equal(deleted.status, 204);
  assert.deepEqual({ ...database.sql.prepare('SELECT is_active,auth_version FROM users WHERE id=?').get(user.id) }, { is_active: 0, auth_version: 2 });
});

test('Admin changes for User A sync to A only and audit identifies actor and target', async () => {
  const [admin, userA, userB] = await Promise.all([signIn('admin'), signIn('user-a'), signIn('user-b')]);
  const write = await app.fetch(api('/api/users/user-a/wallets', admin, {
    method: 'POST', body: { name: 'Admin wallet for A', type: 'CASH' }
  }), env);
  assert.equal(write.status, 201);
  const wallet = (await write.json()).wallet;
  assert.equal(wallet.ownerUserId, 'user-a');

  const [pullA, pullB, walletsA, walletsB] = await Promise.all([
    app.fetch(api('/api/users/user-a/sync/pull?cursor=0', userA), env),
    app.fetch(api('/api/users/user-b/sync/pull?cursor=0', userB), env),
    app.fetch(api('/api/users/user-a/wallets', userA), env),
    app.fetch(api('/api/users/user-b/wallets', userB), env)
  ]);
  assert.equal(pullA.status, 200);
  assert.ok((await pullA.json()).changes.some((change) => change.entity === 'wallet' && change.recordId === wallet.id));
  assert.deepEqual((await pullB.json()).changes, []);
  assert.ok((await walletsA.json()).wallets.some((item) => item.id === wallet.id));
  assert.deepEqual((await walletsB.json()).wallets, []);
  assert.equal((await app.fetch(api('/api/users/user-a/wallets', userB), env)).status, 403);

  const auditResponse = await app.fetch(api('/api/admin/audit', admin), env);
  assert.equal(auditResponse.status, 200);
  const events = (await auditResponse.json()).events.filter((event) => event.entity === 'wallet' && event.recordId === wallet.id);
  assert.equal(events.length, 1);
  assert.deepEqual({ actorUserId: events[0].actorUserId, actorUsername: events[0].actorUsername,
    ownerUserId: events[0].ownerUserId, ownerUsername: events[0].ownerUsername,
    entity: events[0].entity, recordId: events[0].recordId, action: events[0].action }, {
    actorUserId: 'admin', actorUsername: 'admin', ownerUserId: 'user-a', ownerUsername: 'user-a',
    entity: 'wallet', recordId: wallet.id, action: 'CREATE'
  });
});

test('admin budget CRUD is owner-scoped, synchronized and auditable', async () => {
  const [admin, userA, userB] = await Promise.all([signIn('admin'), signIn('user-a'), signIn('user-b')]);
  const categoryResponse = await app.fetch(api('/api/users/user-a/categories', userA), env);
  assert.equal(categoryResponse.status, 200);
  const category = (await categoryResponse.json()).categories.find((item) => item.type === 'EXPENSE');
  const createResponse = await app.fetch(api('/api/users/user-a/budgets', admin, {
    method: 'POST', body: { categoryId: category.id, period: '2026-10', amount: 500000 }
  }), env);
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).budget;
  assert.deepEqual({ ownerUserId: created.ownerUserId, categoryId: created.categoryId, amount: created.amount }, {
    ownerUserId: 'user-a', categoryId: category.id, amount: 500000
  });
  const updateResponse = await app.fetch(api(`/api/users/user-a/budgets/${created.id}`, admin, {
    method: 'PUT', body: { categoryId: category.id, period: '2026-10', amount: 700000 }
  }), env);
  assert.equal(updateResponse.status, 200);
  const updated = (await updateResponse.json()).budget;
  assert.equal(updated.revision, created.revision + 1);
  assert.equal((await app.fetch(api('/api/users/user-b/budgets', userA), env)).status, 403);

  const [pullA, pullB, listB] = await Promise.all([
    app.fetch(api('/api/users/user-a/sync/pull?cursor=0', userA), env),
    app.fetch(api('/api/users/user-b/sync/pull?cursor=0', userB), env),
    app.fetch(api('/api/users/user-b/budgets', userB), env)
  ]);
  const budgetChanges = (await pullA.json()).changes.filter((change) => change.entity === 'budget' && change.recordId === created.id);
  assert.equal(budgetChanges.length, 2);
  assert.equal(budgetChanges.at(-1).payload.amount, 700000);
  assert.deepEqual((await pullB.json()).changes, []);
  assert.deepEqual((await listB.json()).budgets, []);

  const deleted = await app.fetch(api(`/api/users/user-a/budgets/${created.id}`, admin, { method: 'DELETE' }), env);
  assert.equal(deleted.status, 204);
  const deletePull = await app.fetch(api('/api/users/user-a/sync/pull?cursor=0', userA), env);
  const deleteChange = (await deletePull.json()).changes.find((change) => change.entity === 'budget' && change.recordId === created.id && change.operation === 'DELETE');
  assert.ok(deleteChange);

  const auditResponse = await app.fetch(api('/api/admin/audit', admin), env);
  const budgetAudits = (await auditResponse.json()).events.filter((event) => event.entity === 'budget');
  assert.deepEqual(new Set(budgetAudits.map((event) => `${event.actorUserId}:${event.ownerUserId}:${event.action}`)), new Set([
    'admin:user-a:CREATE', 'admin:user-a:UPDATE', 'admin:user-a:DELETE'
  ]));
});
