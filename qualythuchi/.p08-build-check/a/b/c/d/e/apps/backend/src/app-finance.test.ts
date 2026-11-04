import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { app } from './app';
import { sqliteD1 } from '../test/sqlite-d1.mjs';
import { hashPassword } from './modules/auth/password';

const ORIGIN = 'https://app.example.test';
const PASSWORD = 'integration test password';
let passwordHash: string;
const databases: DatabaseSync[] = [];
beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture() {
  const database = sqliteD1();
  databases.push(database.sql);
  for (const [id, role] of [['user-a', 'USER'], ['user-b', 'USER'], ['admin', 'SUPER_ADMIN']]) {
    database.sql.prepare('INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, id, id, role, passwordHash, Date.now(), Date.now());
  }
  return { ...database, env: { DB: database.db as unknown as D1Database, APP_ENV: 'prod', CORS_ORIGINS: ORIGIN } satisfies Env };
}

async function signIn(env: Env, username: string) {
  const response = await app.fetch(new Request(`${ORIGIN}/auth/login`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD })
  }), env);
  expect(response.status).toBe(200);
  const dto = await response.json() as { csrfToken: string };
  return { cookie: response.headers.get('Set-Cookie')!.split(';')[0], csrf: dto.csrfToken };
}

function apiRequest(path: string, cookie?: string, options: { method?: string; csrf?: string; body?: unknown } = {}) {
  const { method = 'GET', csrf, body } = options;
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

describe('P02 wallet and category APIs', () => {
  it('enforces owner scope, CSRF, integer VND validation and wallet CRUD', async () => {
    const { env } = fixture();
    const userA = await signIn(env, 'user-a');
    const userB = await signIn(env, 'user-b');
    const collection = '/api/users/user-a/wallets';

    expect((await app.fetch(apiRequest(collection), env)).status).toBe(401);
    expect((await app.fetch(apiRequest('/api/users/user-b/wallets', userA.cookie), env)).status).toBe(403);
    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', body: { name: 'Cash', type: 'CASH', ownerUserId: 'user-b' } }), env)).status).toBe(403);
    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', body: { name: 'Cash', type: 'CASH' } }), env)).status).toBe(403);
    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Cash', type: 'CASH', ownerUserId: 'user-b' } }), env)).status).toBe(400);
    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Cash', type: 'CASH', openingBalance: 1.5 } }), env)).status).toBe(400);

    const created = await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Tiền mặt', type: 'CASH', openingBalance: -125000 } }), env);
    expect(created.status).toBe(201);
    const wallet = (await created.json() as { wallet: { id: string; ownerUserId: string; openingBalance: number } }).wallet;
    expect(wallet).toMatchObject({ ownerUserId: 'user-a', openingBalance: -125000 });
    expect((await app.fetch(apiRequest(`${collection}/${wallet.id}`, userA.cookie), env)).status).toBe(200);
    expect((await app.fetch(apiRequest(collection, userB.cookie), env)).status).toBe(403);
    const userBWalletsResponse = await app.fetch(apiRequest('/api/users/user-b/wallets', userB.cookie), env);
    expect(userBWalletsResponse.status).toBe(200);
    expect((await userBWalletsResponse.json() as { wallets: unknown[] }).wallets).toHaveLength(0);
    expect((await app.fetch(apiRequest(`/api/users/user-b/wallets/${wallet.id}`, userA.cookie), env)).status).toBe(403);

    const duplicate = await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: '  TIỀN   MẶT ', type: 'BANK' } }), env);
    expect(duplicate.status).toBe(409);
    const updated = await app.fetch(apiRequest(`${collection}/${wallet.id}`, userA.cookie, { method: 'PUT', csrf: userA.csrf, body: { name: 'Ví lương', type: 'BANK', openingBalance: 2500000 } }), env);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ wallet: { name: 'Ví lương', type: 'BANK', openingBalance: 2500000 } });
    expect((await app.fetch(apiRequest(`${collection}/${wallet.id}`, userA.cookie, { method: 'DELETE', csrf: userA.csrf }), env)).status).toBe(204);
    expect((await app.fetch(apiRequest(`${collection}/${wallet.id}`, userA.cookie), env)).status).toBe(404);
  });

  it('provides default categories and supports scoped CRUD with duplicate and default-delete guards', async () => {
    const { env } = fixture();
    const userA = await signIn(env, 'user-a');
    const userB = await signIn(env, 'user-b');
    const collection = '/api/users/user-a/categories';
    const listed = await app.fetch(apiRequest(collection, userA.cookie), env);
    expect(listed.status).toBe(200);
    const categories = (await listed.json() as { categories: Array<{ id: string; name: string; type: string; isDefault: boolean }> }).categories;
    expect(categories).toHaveLength(12);
    const food = categories.find((category) => category.name === 'Ăn uống')!;
    expect(food).toMatchObject({ type: 'EXPENSE', isDefault: true });
    expect((await app.fetch(apiRequest('/api/users/user-b/categories', userA.cookie), env)).status).toBe(403);
    expect((await app.fetch(apiRequest(collection, userB.cookie), env)).status).toBe(403);
    const userBCategoriesResponse = await app.fetch(apiRequest('/api/users/user-b/categories', userB.cookie), env);
    const userBCategories = await userBCategoriesResponse.json() as { categories: unknown[] };
    expect(userBCategories.categories).toHaveLength(12);
    expect((await app.fetch(apiRequest(`${collection}/${food.id}`, userA.cookie, { method: 'DELETE', csrf: userA.csrf }), env)).status).toBe(409);

    const created = await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Du lịch', type: 'EXPENSE' } }), env);
    expect(created.status).toBe(201);
    const category = (await created.json() as { category: { id: string; ownerUserId: string } }).category;
    expect(category.ownerUserId).toBe('user-a');
    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: '  DU LỊCH ', type: 'EXPENSE' } }), env)).status).toBe(409);
    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Du lịch', type: 'INCOME' } }), env)).status).toBe(201);
    expect((await app.fetch(apiRequest(`${collection}/${category.id}`, userA.cookie, { method: 'PUT', csrf: userA.csrf, body: { name: 'Nghỉ dưỡng', type: 'EXPENSE' } }), env)).status).toBe(200);
    expect((await app.fetch(apiRequest(`${collection}/${category.id}`, userA.cookie, { method: 'DELETE', csrf: userA.csrf }), env)).status).toBe(204);
  });

  it('refuses to delete a wallet or category referenced by a transaction', async () => {
    const { env } = fixture();
    const userA = await signIn(env, 'user-a');
    const walletResponse = await app.fetch(apiRequest('/api/users/user-a/wallets', userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Bank', type: 'BANK' } }), env);
    const wallet = (await walletResponse.json() as { wallet: { id: string } }).wallet;
    const categoryResponse = await app.fetch(apiRequest('/api/users/user-a/categories', userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Phí', type: 'EXPENSE' } }), env);
    const category = (await categoryResponse.json() as { category: { id: string } }).category;
    const transaction = await app.fetch(apiRequest('/api/users/user-a/transactions', userA.cookie, { method: 'POST', csrf: userA.csrf, body: {
      type: 'EXPENSE', amount: 100, categoryId: category.id, walletId: wallet.id,
      occurredAt: new Date().toISOString(), note: '', tags: []
    } }), env);
    expect(transaction.status).toBe(201);
    expect((await app.fetch(apiRequest(`/api/users/user-a/wallets/${wallet.id}`, userA.cookie, { method: 'DELETE', csrf: userA.csrf }), env)).status).toBe(409);
    expect((await app.fetch(apiRequest(`/api/users/user-a/categories/${category.id}`, userA.cookie, { method: 'DELETE', csrf: userA.csrf }), env)).status).toBe(409);
  });

  it('creates, edits, lists, tombstones and undoes transactions while deriving wallet balance from the ledger', async () => {
    const { env } = fixture();
    const userA = await signIn(env, 'user-a');
    const userB = await signIn(env, 'user-b');
    const walletResponse = await app.fetch(apiRequest('/api/users/user-a/wallets', userA.cookie, { method: 'POST', csrf: userA.csrf, body: {
      name: 'Cash', type: 'CASH', openingBalance: 1_000
    } }), env);
    const wallet = (await walletResponse.json() as { wallet: { id: string } }).wallet;
    const categoriesResponse = await app.fetch(apiRequest('/api/users/user-a/categories', userA.cookie), env);
    const categories = (await categoriesResponse.json() as { categories: Array<{ id: string; type: string }> }).categories;
    const category = categories.find((item) => item.type === 'EXPENSE')!;
    const incomeCategory = categories.find((item) => item.type === 'INCOME')!;
    const collection = '/api/users/user-a/transactions';
    const body = { id: 'client-transaction-1', type: 'EXPENSE', amount: 250, categoryId: category.id, walletId: wallet.id, occurredAt: '2026-10-22T12:00:00.000Z', note: 'Lunch', tags: ['work'] };

    const userBWalletResponse = await app.fetch(apiRequest('/api/users/user-b/wallets', userB.cookie, { method: 'POST', csrf: userB.csrf, body: { name: 'Private', type: 'CASH' } }), env);
    const userBWallet = (await userBWalletResponse.json() as { wallet: { id: string } }).wallet;
    for (const amount of [0, -1, 250.5, Number.MAX_SAFE_INTEGER + 1, '250']) {
      expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { ...body, amount } }), env)).status).toBe(400);
    }
    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { ...body, walletId: userBWallet.id } }), env)).status).toBe(400);
    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { ...body, categoryId: incomeCategory.id } }), env)).status).toBe(400);

    expect((await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body }), env)).status).toBe(201);
    const duplicateRetry = await app.fetch(apiRequest(collection, userA.cookie, { method: 'POST', csrf: userA.csrf, body }), env);
    expect(duplicateRetry.status).toBe(201);
    expect((await duplicateRetry.json() as { transaction: { id: string; revision: number } }).transaction).toMatchObject({ id: body.id, revision: 1 });
    const initialWallets = await app.fetch(apiRequest('/api/users/user-a/wallets', userA.cookie), env);
    expect((await initialWallets.json() as { wallets: Array<{ currentBalance: number }> }).wallets[0].currentBalance).toBe(750);
    expect((await app.fetch(apiRequest(`/api/users/user-a/transactions/${body.id}`, userB.cookie), env)).status).toBe(403);
    expect((await app.fetch(apiRequest('/api/users/user-b/transactions', userB.cookie), env)).status).toBe(200);
    const initialList = await app.fetch(apiRequest(`${collection}?includeDeleted=1`, userA.cookie), env);
    expect((await initialList.json() as { transactions: unknown[] }).transactions).toHaveLength(1);

    const updated = await app.fetch(apiRequest(`${collection}/${body.id}`, userA.cookie, { method: 'PUT', csrf: userA.csrf, body: { ...body, amount: 400, revision: 1 } }), env);
    expect(updated.status).toBe(200);
    expect((await updated.json() as { transaction: { revision: number; amount: number } }).transaction).toMatchObject({ revision: 2, amount: 400 });
    const stale = await app.fetch(apiRequest(`${collection}/${body.id}`, userA.cookie, { method: 'PUT', csrf: userA.csrf, body: { ...body, amount: 500, revision: 1 } }), env);
    expect(stale.status).toBe(409);
    const editedWallets = await app.fetch(apiRequest('/api/users/user-a/wallets', userA.cookie), env);
    expect((await editedWallets.json() as { wallets: Array<{ currentBalance: number }> }).wallets[0].currentBalance).toBe(600);

    const deleted = await app.fetch(apiRequest(`${collection}/${body.id}`, userA.cookie, { method: 'DELETE', csrf: userA.csrf }), env);
    expect(deleted.status).toBe(200);
    expect((await deleted.json() as { transaction: { deletedAt: string | null; revision: number } }).transaction).toMatchObject({ revision: 3 });
    const activeList = await app.fetch(apiRequest(collection, userA.cookie), env);
    expect((await activeList.json() as { transactions: unknown[] }).transactions).toHaveLength(0);
    const undone = await app.fetch(apiRequest(`${collection}/${body.id}/undo`, userA.cookie, { method: 'POST', csrf: userA.csrf, body: {} }), env);
    expect(undone.status).toBe(200);
    expect((await undone.json() as { transaction: { deletedAt: string | null; revision: number } }).transaction).toMatchObject({ deletedAt: null, revision: 4 });
    const restoredWallets = await app.fetch(apiRequest('/api/users/user-a/wallets', userA.cookie), env);
    expect((await restoredWallets.json() as { wallets: Array<{ currentBalance: number }> }).wallets[0].currentBalance).toBe(600);
  });

  it('allows a Super Admin to operate on an explicitly selected owner', async () => {
    const { env } = fixture();
    const admin = await signIn(env, 'admin');
    const response = await app.fetch(apiRequest('/api/users/user-b/wallets', admin.cookie, { method: 'POST', csrf: admin.csrf, body: { name: 'Ví User B', type: 'CASH', openingBalance: 0 } }), env);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ wallet: { ownerUserId: 'user-b' } });
  });

  it('records transfers atomically between owned wallets and includes them in summary history', async () => {
    const { env, sql } = fixture();
    const userA = await signIn(env, 'user-a');
    const userB = await signIn(env, 'user-b');
    const walletsPath = '/api/users/user-a/wallets';
    const sourceResponse = await app.fetch(apiRequest(walletsPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Nguồn', type: 'CASH', openingBalance: 1000 } }), env);
    const destinationResponse = await app.fetch(apiRequest(walletsPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Đích', type: 'BANK', openingBalance: 50 } }), env);
    const source = (await sourceResponse.json() as { wallet: { id: string } }).wallet;
    const destination = (await destinationResponse.json() as { wallet: { id: string } }).wallet;
    const otherWalletResponse = await app.fetch(apiRequest('/api/users/user-b/wallets', userB.cookie, { method: 'POST', csrf: userB.csrf, body: { name: 'Riêng', type: 'CASH' } }), env);
    const otherWallet = (await otherWalletResponse.json() as { wallet: { id: string } }).wallet;
    const transferPath = '/api/users/user-a/transfers';
    const body = { id: 'transfer-once', sourceWalletId: source.id, destinationWalletId: destination.id, amount: 300, occurredAt: '2026-10-23T12:00:00.000Z' };

    expect((await app.fetch(apiRequest(transferPath, userA.cookie, { method: 'POST', body }), env)).status).toBe(403);
    expect((await app.fetch(apiRequest(transferPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { ...body, destinationWalletId: otherWallet.id } }), env)).status).toBe(400);
    expect((await app.fetch(apiRequest(transferPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { ...body, destinationWalletId: source.id } }), env)).status).toBe(400);
    const created = await app.fetch(apiRequest(transferPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body }), env);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ transfer: { id: 'transfer-once', type: 'TRANSFER', amount: 300 } });
    expect((await app.fetch(apiRequest(transferPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body }), env)).status).toBe(201);
    expect((sql.prepare('SELECT COUNT(*) AS count FROM transfers WHERE owner_user_id = ?').get('user-a') as { count: number }).count).toBe(1);

    const wallets = await app.fetch(apiRequest(walletsPath, userA.cookie), env);
    expect((await wallets.json() as { wallets: Array<{ id: string; currentBalance: number }> }).wallets)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: source.id, currentBalance: 700 }), expect.objectContaining({ id: destination.id, currentBalance: 350 })]));
    expect((await app.fetch(apiRequest('/api/users/user-b/summary', userA.cookie), env)).status).toBe(403);
    const summaryResponse = await app.fetch(apiRequest('/api/users/user-a/summary', userA.cookie), env);
    expect(summaryResponse.status).toBe(200);
    expect(await summaryResponse.json()).toMatchObject({ totalBalance: 1050, incomeThisMonth: 0, expenseThisMonth: 0, recent: [expect.objectContaining({ type: 'TRANSFER', walletName: 'Nguồn', destinationWalletName: 'Đích' })] });
    const historyResponse = await app.fetch(apiRequest(transferPath, userA.cookie), env);
    expect(await historyResponse.json()).toMatchObject({ transfers: [expect.objectContaining({ id: 'transfer-once', type: 'TRANSFER' })] });
    expect((await app.fetch(apiRequest(transferPath, userB.cookie), env)).status).toBe(403);
    expect((await app.fetch(apiRequest(`/api/users/user-a/wallets/${source.id}`, userA.cookie, { method: 'DELETE', csrf: userA.csrf }), env)).status).toBe(409);
  });

  it('rolls back a transfer write if a later database step in its statement fails', async () => {
    const { env, sql } = fixture();
    const userA = await signIn(env, 'user-a');
    const walletsPath = '/api/users/user-a/wallets';
    const sourceResponse = await app.fetch(apiRequest(walletsPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Nguồn rollback', type: 'CASH', openingBalance: 900 } }), env);
    const destinationResponse = await app.fetch(apiRequest(walletsPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body: { name: 'Đích rollback', type: 'BANK', openingBalance: 100 } }), env);
    const source = (await sourceResponse.json() as { wallet: { id: string } }).wallet;
    const destination = (await destinationResponse.json() as { wallet: { id: string } }).wallet;

    // The trigger performs a write and then aborts. SQLite must roll back both
    // the transfer row and the trigger's side effect as one atomic statement.
    sql.exec(`CREATE TABLE transfer_audit (transfer_id TEXT NOT NULL);
      CREATE TRIGGER fail_transfer_after_audit AFTER INSERT ON transfers BEGIN
        INSERT INTO transfer_audit (transfer_id) VALUES (NEW.id);
        SELECT RAISE(ABORT, 'simulated downstream failure');
      END;`);
    const result = await app.fetch(apiRequest('/api/users/user-a/transfers', userA.cookie, { method: 'POST', csrf: userA.csrf, body: {
      id: 'transfer-rollback', sourceWalletId: source.id, destinationWalletId: destination.id,
      amount: 250, occurredAt: '2026-10-23T12:00:00.000Z'
    } }), env);
    expect(result.status).toBe(500);
    expect((sql.prepare('SELECT COUNT(*) AS count FROM transfers').get() as { count: number }).count).toBe(0);
    expect((sql.prepare('SELECT COUNT(*) AS count FROM transfer_audit').get() as { count: number }).count).toBe(0);
    const wallets = await app.fetch(apiRequest(walletsPath, userA.cookie), env);
    expect((await wallets.json() as { wallets: Array<{ id: string; currentBalance: number }> }).wallets)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: source.id, currentBalance: 900 }), expect.objectContaining({ id: destination.id, currentBalance: 100 })]));
  });
});

describe('P06 admin account, finance and audit APIs', () => {
  it('allows only admins to manage accounts, records changes and deactivates without deleting history', async () => {
    const { env, sql } = fixture();
    const admin = await signIn(env, 'admin');
    const user = await signIn(env, 'user-a');
    const denied = await app.fetch(apiRequest('/api/admin/users', user.cookie, { method: 'POST', csrf: user.csrf, body: { username: 'new-user', displayName: 'New User', password: 'password123' } }), env);
    expect(denied.status).toBe(403);

    const created = await app.fetch(apiRequest('/api/admin/users', admin.cookie, { method: 'POST', csrf: admin.csrf, body: { username: 'new-user', displayName: 'New User', password: 'password123' } }), env);
    expect(created.status).toBe(201);
    const createdUser = (await created.json() as { user: { id: string; role: string } }).user;
    expect(createdUser.role).toBe('USER');

    const updated = await app.fetch(apiRequest(`/api/admin/users/${createdUser.id}`, admin.cookie, { method: 'PUT', csrf: admin.csrf, body: { displayName: 'Renamed User' } }), env);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ user: { id: createdUser.id, displayName: 'Renamed User' } });
    const deleted = await app.fetch(apiRequest(`/api/admin/users/${createdUser.id}`, admin.cookie, { method: 'DELETE', csrf: admin.csrf }), env);
    expect(deleted.status).toBe(204);
    expect(sql.prepare('SELECT is_active,auth_version FROM users WHERE id=?').get(createdUser.id)).toMatchObject({ is_active: 0, auth_version: 2 });

    const audit = await app.fetch(apiRequest('/api/admin/audit', admin.cookie), env);
    expect(audit.status).toBe(200);
    expect(await audit.json()).toMatchObject({ events: expect.arrayContaining([
      expect.objectContaining({ actorUserId: 'admin', ownerUserId: createdUser.id, entity: 'user', action: 'CREATE' }),
      expect.objectContaining({ actorUserId: 'admin', ownerUserId: createdUser.id, entity: 'user', action: 'UPDATE' }),
      expect.objectContaining({ actorUserId: 'admin', ownerUserId: createdUser.id, entity: 'user', action: 'DEACTIVATE' })
    ]) });
    expect(() => sql.prepare("UPDATE admin_audit_log SET action='TAMPERED'").run()).toThrow(/immutable/);
    expect(() => sql.prepare('DELETE FROM admin_audit_log').run()).toThrow(/immutable/);
  });

  it('scopes administrator finance writes to ownerUserId and audits actor, target and action', async () => {
    const { env, sql } = fixture();
    const admin = await signIn(env, 'admin');
    const userA = await signIn(env, 'user-a');
    const userB = await signIn(env, 'user-b');
    const created = await app.fetch(apiRequest('/api/users/user-a/wallets', admin.cookie, { method: 'POST', csrf: admin.csrf, body: { name: 'Admin wallet', type: 'CASH' } }), env);
    expect(created.status).toBe(201);
    const wallet = (await created.json() as { wallet: { id: string; ownerUserId: string } }).wallet;
    expect(wallet.ownerUserId).toBe('user-a');
    expect(sql.prepare('SELECT actor_user_id,owner_user_id,entity,record_id,action,created_at FROM admin_audit_log').get()).toMatchObject({
      actor_user_id: 'admin', owner_user_id: 'user-a', entity: 'wallet', record_id: wallet.id, action: 'CREATE'
    });
    const userAPull = await app.fetch(apiRequest('/api/users/user-a/sync/pull?cursor=0', userA.cookie), env);
    expect(await userAPull.json()).toMatchObject({ changes: expect.arrayContaining([expect.objectContaining({ entity: 'wallet', recordId: wallet.id, operation: 'UPSERT' })]) });
    const userBPull = await app.fetch(apiRequest('/api/users/user-b/sync/pull?cursor=0', userB.cookie), env);
    expect((await userBPull.json() as { changes: unknown[] }).changes).toHaveLength(0);
    expect((await app.fetch(apiRequest('/api/users/user-b/wallets', userA.cookie), env)).status).toBe(403);
    const audit = await app.fetch(apiRequest('/api/admin/audit', admin.cookie), env);
    expect(await audit.json()).toMatchObject({ events: [expect.objectContaining({ actorUserId: 'admin', actorUsername: 'admin', ownerUserId: 'user-a', ownerUsername: 'user-a', entity: 'wallet', recordId: wallet.id, action: 'CREATE' })] });
  });
});

describe('P05 sync API', () => {
  it('scopes pull by owner and atomically pushes idempotent batches with admin audit', async () => {
    const { env, sql } = fixture();
    const admin = await signIn(env, 'admin');
    const userA = await signIn(env, 'user-a');
    await app.fetch(apiRequest('/api/users/user-a/categories', userA.cookie), env);
    const walletId = 'sync-wallet-a';
    const categoryId = String((sql.prepare("SELECT id FROM categories WHERE owner_user_id='user-a' AND type='EXPENSE' LIMIT 1").get() as { id: string }).id);
    sql.prepare(`INSERT INTO wallets(id,owner_user_id,name,normalized_name,type,opening_balance,created_at,updated_at)
      VALUES(?, 'user-a', 'Sync wallet', 'sync wallet', 'CASH', 0, 1000, 1000)`).run(walletId);
    const path = '/api/users/user-a/sync/push';
    const batch = { idempotencyKey: 'sync-key-0001', changes: [{ entity: 'transaction', operation: 'upsert', id: 'sync-tx-1', revision: 0,
      data: { type: 'EXPENSE', amount: 450, walletId, categoryId, occurredAt: new Date(2000).toISOString(), note: 'offline', tags: ['local'] } }] };
    const pushed = await app.fetch(apiRequest(path, admin.cookie, { method: 'POST', csrf: admin.csrf, body: batch }), env);
    expect(pushed.status).toBe(200);
    expect((await pushed.json() as { applied: unknown[] }).applied).toHaveLength(1);
    expect((sql.prepare('SELECT COUNT(*) AS count FROM admin_audit_log WHERE actor_user_id=? AND owner_user_id=?').get('admin', 'user-a') as { count: number }).count).toBe(1);
    const replay = await app.fetch(apiRequest(path, admin.cookie, { method: 'POST', csrf: admin.csrf, body: batch }), env);
    expect(replay.status).toBe(200);
    expect((sql.prepare('SELECT COUNT(*) AS count FROM transactions WHERE id=?').get('sync-tx-1') as { count: number }).count).toBe(1);
    const reused = await app.fetch(apiRequest(path, admin.cookie, { method: 'POST', csrf: admin.csrf, body: { ...batch, changes: [{ ...batch.changes[0], data: { ...batch.changes[0].data, note: 'different body' } }] } }), env);
    expect(reused.status).toBe(409);

    const pulled = await app.fetch(apiRequest('/api/users/user-a/sync/pull?cursor=0', userA.cookie), env);
    expect(pulled.status).toBe(200);
    expect(await pulled.json()).toMatchObject({ changes: expect.arrayContaining([expect.objectContaining({ entity: 'wallet', recordId: walletId }), expect.objectContaining({ entity: 'transaction', recordId: 'sync-tx-1' })]) });
    expect((await app.fetch(apiRequest('/api/users/user-b/sync/pull?cursor=0', userA.cookie), env)).status).toBe(403);
    expect((await app.fetch(apiRequest('/api/users/user-a/sync/push', userA.cookie, { method: 'POST', body: batch }), env)).status).toBe(403);
  });

  it('rolls back every change in a batch when a later revision assertion fails', async () => {
    const { env, sql } = fixture();
    const userA = await signIn(env, 'user-a');
    await app.fetch(apiRequest('/api/users/user-a/categories', userA.cookie), env);
    const categoryId = String((sql.prepare("SELECT id FROM categories WHERE owner_user_id='user-a' AND type='EXPENSE' LIMIT 1").get() as { id: string }).id);
    sql.prepare(`INSERT INTO wallets(id,owner_user_id,name,normalized_name,type,opening_balance,created_at,updated_at)
      VALUES('atomic-wallet', 'user-a', 'Atomic', 'atomic', 'CASH', 0, 1000, 1000)`).run();
    const response = await app.fetch(apiRequest('/api/users/user-a/sync/push', userA.cookie, { method: 'POST', csrf: userA.csrf, body: {
      idempotencyKey: 'atomic-key-0001', changes: [
        { entity: 'transaction', operation: 'upsert', id: 'atomic-tx-1', revision: 0, data: { type: 'EXPENSE', amount: 100, walletId: 'atomic-wallet', categoryId, occurredAt: new Date(2000).toISOString() } },
        { entity: 'transaction', operation: 'upsert', id: 'stale-tx', revision: 8, data: { type: 'EXPENSE', amount: 100, walletId: 'atomic-wallet', categoryId, occurredAt: new Date(2000).toISOString() } }
      ]
    } }), env);
    expect(response.status).toBe(409);
    expect((sql.prepare('SELECT COUNT(*) AS count FROM transactions WHERE id IN (?,?)').get('atomic-tx-1', 'stale-tx') as { count: number }).count).toBe(0);
    expect((sql.prepare('SELECT COUNT(*) AS count FROM sync_batches').get() as { count: number }).count).toBe(0);
  });

  it('rejects stale edits without overwriting the server and gives pull a stable change order', async () => {
    const { env, sql } = fixture();
    const admin = await signIn(env, 'admin');
    const userA = await signIn(env, 'user-a');
    await app.fetch(apiRequest('/api/users/user-a/categories', userA.cookie), env);
    const categoryId = String((sql.prepare("SELECT id FROM categories WHERE owner_user_id='user-a' AND type='EXPENSE' LIMIT 1").get() as { id: string }).id);
    sql.prepare(`INSERT INTO wallets(id,owner_user_id,name,normalized_name,type,opening_balance,created_at,updated_at)
      VALUES('conflict-wallet', 'user-a', 'Conflict', 'conflict', 'CASH', 0, 1000, 1000)`).run();
    const pushPath = '/api/users/user-a/sync/push';
    const baseData = { type: 'EXPENSE', amount: 100, walletId: 'conflict-wallet', categoryId, occurredAt: new Date(2000).toISOString(), note: 'original' };
    const initial = { idempotencyKey: 'conflict-create-01', changes: [
      { entity: 'transaction', operation: 'upsert', id: 'conflict-tx', revision: 0, data: baseData },
      { entity: 'transaction', operation: 'upsert', id: 'ordered-tx', revision: 0, data: { ...baseData, note: 'second' } }
    ] };
    expect((await app.fetch(apiRequest(pushPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body: initial }), env)).status).toBe(200);

    const adminEdit = { idempotencyKey: 'conflict-admin-01', changes: [{ entity: 'transaction', operation: 'upsert', id: 'conflict-tx', revision: 1,
      data: { ...baseData, amount: 250, note: 'admin edit' } }] };
    expect((await app.fetch(apiRequest(pushPath, admin.cookie, { method: 'POST', csrf: admin.csrf, body: adminEdit }), env)).status).toBe(200);
    const staleEdit = { idempotencyKey: 'conflict-user-01', changes: [{ entity: 'transaction', operation: 'upsert', id: 'conflict-tx', revision: 1,
      data: { ...baseData, amount: 999, note: 'stale device edit' } }] };
    expect((await app.fetch(apiRequest(pushPath, userA.cookie, { method: 'POST', csrf: userA.csrf, body: staleEdit }), env)).status).toBe(409);
    expect(sql.prepare('SELECT amount,revision,note FROM transactions WHERE owner_user_id=? AND id=?').get('user-a', 'conflict-tx'))
      .toMatchObject({ amount: 250, revision: 2, note: 'admin edit' });

    const pull = await app.fetch(apiRequest('/api/users/user-a/sync/pull?cursor=0&limit=500', userA.cookie), env);
    expect(pull.status).toBe(200);
    const changes = (await pull.json() as { changes: Array<{ entity: string; recordId: string; cursor: number; payload: { amount?: number; note?: string } }> }).changes;
    const orderedChanges = changes.filter((change) => ['conflict-tx', 'ordered-tx'].includes(change.recordId) && change.entity === 'transaction');
    expect(orderedChanges.map((change) => change.recordId)).toEqual(['conflict-tx', 'ordered-tx', 'conflict-tx']);
    expect(orderedChanges.map((change) => change.cursor)).toEqual([...orderedChanges.map((change) => change.cursor)].sort((a, b) => a - b));
    expect(orderedChanges.at(-1)?.payload).toMatchObject({ amount: 250, note: 'admin edit' });
  });
});

