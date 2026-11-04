import assert from 'node:assert/strict';
import test from 'node:test';
import { sqliteD1 } from './sqlite-d1.mjs';
import { FinanceRepository } from '../src/modules/finance/repository.ts';
import { TransactionsRepository } from '../src/modules/finance/transactions-repository.ts';

function fixture() {
  const database = sqliteD1();
  database.sql.prepare(`INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at)
    VALUES ('owner-a', 'owner-a', 'Owner A', 'USER', 'hash', 1, 1), ('owner-b', 'owner-b', 'Owner B', 'USER', 'hash', 1, 1)`).run();
  return database;
}

async function prepareRecords(database) {
  const finance = new FinanceRepository(database.db);
  const transactions = new TransactionsRepository(database.db);
  const wallet = await finance.createWallet('owner-a', { name: 'Cash', type: 'CASH', openingBalance: 1_000, accountLabel: '', accountReference: '' });
  const category = await finance.createCategory('owner-a', { name: 'Meals', type: 'EXPENSE' });
  const otherOwnerCategory = await finance.createCategory('owner-b', { name: 'Meals', type: 'EXPENSE' });
  return { finance, transactions, wallet, category, otherOwnerCategory };
}

function input(walletId, categoryId, overrides = {}) {
  return { id: 'stable-client-id', type: 'EXPENSE', amount: 250, walletId, categoryId, occurredAt: 1_000, note: 'Lunch', tags: ['work'], ...overrides };
}

test('transaction revisions, tombstones, undo window and ledger balance stay consistent', async () => {
  const database = fixture();
  try {
    const { finance, transactions, wallet, category } = await prepareRecords(database);
    const created = await transactions.create('owner-a', input(wallet.id, category.id), 2_000);
    assert.equal(created.revision, 1);
    assert.equal(await transactions.walletBalance('owner-a', wallet.id), 750);
    assert.equal((await transactions.create('owner-a', input(wallet.id, category.id), 2_001)).id, created.id);

    const updated = await transactions.update('owner-a', created.id, input(wallet.id, category.id, { amount: 400, revision: 1 }), 3_000);
    assert.equal(updated.revision, 2);
    assert.equal(await transactions.walletBalance('owner-a', wallet.id), 600);
    await assert.rejects(() => transactions.update('owner-a', created.id, input(wallet.id, category.id, { amount: 500, revision: 1 }), 3_001), { code: 'REVISION_CONFLICT' });

    const deleted = await transactions.delete('owner-a', created.id, 4_000);
    assert.equal(deleted.deleted_at, 4_000);
    assert.equal(deleted.revision, 3);
    assert.equal(await transactions.walletBalance('owner-a', wallet.id), 1_000);
    assert.equal((await transactions.list('owner-a')).results.length, 0);
    assert.equal((await transactions.list('owner-a', { includeDeleted: true })).results.length, 1);

    const restored = await transactions.undo('owner-a', created.id, 13_000);
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.revision, 4);
    assert.equal(await transactions.walletBalance('owner-a', wallet.id), 600);

    await transactions.delete('owner-a', created.id, 20_000);
    assert.equal(await transactions.undo('owner-a', created.id, 30_001), 'EXPIRED');
    assert.equal((await finance.deleteWallet('owner-a', wallet.id)), 'IN_USE');

    const boundary = await transactions.create('owner-a', input(wallet.id, category.id, { id: 'boundary-id', amount: 100 }), 40_000);
    await transactions.delete('owner-a', boundary.id, 41_000);
    const boundaryUndo = await transactions.undo('owner-a', boundary.id, 51_000);
    assert.equal(boundaryUndo.deleted_at, null);
    assert.equal(boundaryUndo.revision, 3);
  } finally { database.close(); }
});

test('composite foreign keys reject a category owned by another user', async () => {
  const database = fixture();
  try {
    const { wallet, otherOwnerCategory } = await prepareRecords(database);
    assert.throws(() => database.sql.prepare(`INSERT INTO transactions
      (id, owner_user_id, wallet_id, category_id, type, amount, occurred_at, note, tags_json, created_at, updated_at, revision)
      VALUES ('forged', 'owner-a', ?, ?, 'EXPENSE', 100, 1000, '', '[]', 1000, 1000, 1)`)
      .run(wallet.id, otherOwnerCategory.id), /FOREIGN KEY constraint failed/);
  } finally { database.close(); }
});
