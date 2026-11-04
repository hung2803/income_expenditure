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

test('budget CRUD, aggregation, owner scope and threshold events are deduplicated', async () => {
  const userA = await signIn('user-a');
  const userB = await signIn('user-b');
  const base = '/api/users/user-a';

  const categoriesResponse = await app.fetch(api(`${base}/categories`, userA), env);
  const categories = (await categoriesResponse.json()).categories;
  const food = categories.find((category) => category.name === 'Ăn uống');
  const travel = categories.find((category) => category.name === 'Di chuyển');
  const walletResponse = await app.fetch(api(`${base}/wallets`, userA, { method: 'POST', body: { name: 'Budget test wallet', type: 'CASH' } }), env);
  const wallet = (await walletResponse.json()).wallet;

  assert.equal((await app.fetch(api(`${base}/budgets`, userB), env)).status, 403);
  assert.equal((await app.fetch(api(`${base}/budgets`, userA), env)).status, 200);
  const createBudget = async (body) => app.fetch(api(`${base}/budgets`, userA, { method: 'POST', body }), env);
  const globalResponse = await createBudget({ period: '2026-10', amount: 1000 });
  assert.equal(globalResponse.status, 201);
  const globalBudget = (await globalResponse.json()).budget;
  const foodResponse = await createBudget({ period: '2026-10', amount: 500, categoryId: food.id });
  assert.equal(foodResponse.status, 201);
  const foodBudget = (await foodResponse.json()).budget;
  assert.equal((await createBudget({ period: '2026-10', amount: 2000 })).status, 409);
  assert.equal((await app.fetch(api(`/api/users/user-b/budgets/${globalBudget.id}`, userA, { method: 'DELETE' }), env)).status, 403);
  assert.equal((await app.fetch(api(`${base}/budgets/summary?period=2026-13`, userA), env)).status, 400);

  const createExpense = (amount, categoryId) => app.fetch(api(`${base}/transactions`, userA, {
    method: 'POST', body: { type: 'EXPENSE', amount, categoryId, walletId: wallet.id, occurredAt: '2026-10-15T12:00:00.000Z' }
  }), env);
  const firstExpense = await createExpense(400, food.id);
  assert.equal(firstExpense.status, 201);
  const first = (await firstExpense.json()).transaction;
  assert.equal((await createExpense(100, food.id)).status, 201);
  assert.equal((await createExpense(300, travel.id)).status, 201);
  assert.equal((await createExpense(200, travel.id)).status, 201);

  const summaryResponse = await app.fetch(api(`${base}/budgets/summary?period=2026-10`, userA), env);
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.budgetAmount, 1000);
  assert.equal(summary.spent, 1000);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.percentUsed, 100);
  assert.deepEqual(summary.budgets.find((budget) => budget.id === foodBudget.id), {
    id: foodBudget.id, ownerUserId: 'user-a', categoryId: food.id, categoryName: food.name,
    period: '2026-10', amount: 500, spent: 500, remaining: 0, percentUsed: 100,
    revision: 1, createdAt: foodBudget.createdAt, updatedAt: foodBudget.updatedAt
  });
  assert.deepEqual(summary.thresholdEvents.map(({ budgetId, milestone }) => [budgetId, milestone]).sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]), [
    [globalBudget.id, 80], [globalBudget.id, 100], [foodBudget.id, 80], [foodBudget.id, 100]
  ].sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]));

  // Subsequent edits and retries cannot emit the same user/budget/period/milestone twice.
  assert.equal((await app.fetch(api(`${base}/transactions/${first.id}`, userA, { method: 'PUT', body: {
    type: 'EXPENSE', amount: 400, categoryId: food.id, walletId: wallet.id,
    occurredAt: '2026-10-15T12:00:00.000Z', note: 'edited', revision: first.revision
  } }), env)).status, 200);
  assert.equal(database.sql.prepare('SELECT COUNT(*) AS count FROM budget_threshold_events').get().count, 4);
  const userBSummary = await app.fetch(api('/api/users/user-b/budgets/summary?period=2026-10', userB), env);
  assert.equal(userBSummary.status, 200);
  assert.equal((await userBSummary.json()).spent, 0);

  const updated = await app.fetch(api(`${base}/budgets/${foodBudget.id}`, userA, { method: 'PUT', body: { period: '2026-10', amount: 600, categoryId: food.id } }), env);
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).budget.amount, 600);
  assert.equal((await app.fetch(api(`${base}/budgets/${foodBudget.id}`, userA, { method: 'DELETE' }), env)).status, 204);
});

test('admin budget writes are owner-scoped and admin-only writes are audited', async () => {
  const budget = await app.fetch(api('/api/users/user-b/budgets', (await signIn('admin')), {
    method: 'POST', body: { period: '2026-10', amount: 300 }
  }), env);
  assert.equal(budget.status, 201);
  const ownerBudget = (await budget.json()).budget;
  assert.equal(ownerBudget.ownerUserId, 'user-b');
  const audit = await app.fetch(api('/api/admin/audit', await signIn('admin')), env);
  assert.ok((await audit.json()).events.some((event) => event.entity === 'budget' && event.ownerUserId === 'user-b' && event.recordId === ownerBudget.id));
});

test('79 to 80 to 100 percent emits each milestone once, transfers are excluded, and edits/deletes recalculate spending', async () => {
  const userA = await signIn('user-a');
  const base = '/api/users/user-a';
  const categoriesResponse = await app.fetch(api(`${base}/categories`, userA), env);
  const categories = (await categoriesResponse.json()).categories;
  const food = categories.find((category) => category.name === 'Ăn uống');

  const createWallet = async (name) => {
    const response = await app.fetch(api(`${base}/wallets`, userA, { method: 'POST', body: { name, type: 'CASH' } }), env);
    assert.equal(response.status, 201);
    return (await response.json()).wallet;
  };
  const source = await createWallet('Threshold source');
  const destination = await createWallet('Threshold destination');
  const budgetResponse = await app.fetch(api(`${base}/budgets`, userA, { method: 'POST', body: { period: '2026-11', amount: 1000 } }), env);
  assert.equal(budgetResponse.status, 201);
  const budget = (await budgetResponse.json()).budget;

  const transferResponse = await app.fetch(api(`${base}/transfers`, userA, { method: 'POST', body: {
    sourceWalletId: source.id,
    destinationWalletId: destination.id,
    amount: 5000,
    occurredAt: '2026-11-10T12:00:00.000Z'
  } }), env);
  assert.equal(transferResponse.status, 201);
  const summaryPath = `${base}/budgets/summary?period=2026-11`;
  const getSummary = async () => {
    const response = await app.fetch(api(summaryPath, userA), env);
    assert.equal(response.status, 200);
    return response.json();
  };
  assert.equal((await getSummary()).spent, 0, 'transfers do not count as budget spending');

  const createExpense = async (amount) => {
    const response = await app.fetch(api(`${base}/transactions`, userA, { method: 'POST', body: {
      type: 'EXPENSE', amount, categoryId: food.id, walletId: source.id,
      occurredAt: '2026-11-12T12:00:00.000Z'
    } }), env);
    assert.equal(response.status, 201);
    return (await response.json()).transaction;
  };
  const sevenNinety = await createExpense(790);
  let summary = await getSummary();
  assert.equal(summary.spent, 790);
  assert.equal(summary.percentUsed, 79);
  assert.equal(summary.thresholdEvents.filter((event) => event.budgetId === budget.id).length, 0);

  const ten = await createExpense(10);
  summary = await getSummary();
  assert.equal(summary.spent, 800);
  assert.equal(summary.percentUsed, 80);
  assert.deepEqual(summary.thresholdEvents.filter((event) => event.budgetId === budget.id).map((event) => event.milestone), [80]);

  const edited = await app.fetch(api(`${base}/transactions/${ten.id}`, userA, { method: 'PUT', body: {
    type: 'EXPENSE', amount: 210, categoryId: food.id, walletId: source.id,
    occurredAt: '2026-11-12T12:00:00.000Z', revision: ten.revision
  } }), env);
  assert.equal(edited.status, 200);
  summary = await getSummary();
  assert.equal(summary.spent, 1000);
  assert.equal(summary.percentUsed, 100);
  assert.deepEqual(summary.thresholdEvents.filter((event) => event.budgetId === budget.id).map((event) => event.milestone).sort((a, b) => a - b), [80, 100]);

  const editAgain = await app.fetch(api(`${base}/transactions/${ten.id}`, userA, { method: 'PUT', body: {
    type: 'EXPENSE', amount: 210, categoryId: food.id, walletId: source.id,
    occurredAt: '2026-11-12T12:00:00.000Z', note: 'edit after threshold', revision: 2
  } }), env);
  assert.equal(editAgain.status, 200);
  summary = await getSummary();
  assert.equal(summary.spent, 1000);
  assert.equal(summary.thresholdEvents.filter((event) => event.budgetId === budget.id).length, 2);

  const deleted = await app.fetch(api(`${base}/transactions/${sevenNinety.id}`, userA, { method: 'DELETE' }), env);
  assert.equal(deleted.status, 200);
  summary = await getSummary();
  assert.equal(summary.spent, 210);
  assert.equal(summary.remaining, 790);
  assert.equal(summary.percentUsed, 21);

  const backToEighty = await createExpense(590);
  summary = await getSummary();
  assert.equal(summary.spent, 800);
  assert.equal(summary.thresholdEvents.filter((event) => event.budgetId === budget.id).length, 2, 'crossing a recorded milestone again is deduplicated');
  assert.equal((await app.fetch(api(`${base}/transactions/${backToEighty.id}`, userA, { method: 'DELETE' }), env)).status, 200);
  summary = await getSummary();
  assert.equal(summary.spent, 210);
  assert.equal(summary.thresholdEvents.filter((event) => event.budgetId === budget.id).length, 2);
});
