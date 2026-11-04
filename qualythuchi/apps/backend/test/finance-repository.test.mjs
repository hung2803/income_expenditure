import assert from 'node:assert/strict';
import test from 'node:test';
import { sqliteD1 } from './sqlite-d1.mjs';
import { FinanceRepository } from '../src/modules/finance/repository.ts';

function fixture() {
  const database = sqliteD1();
  database.sql.prepare(`INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at)
    VALUES ('owner-a', 'owner-a', 'Owner A', 'USER', 'hash', 1, 1), ('owner-b', 'owner-b', 'Owner B', 'USER', 'hash', 1, 1)`).run();
  return database;
}

test('finance repository scopes CRUD by owner and rejects duplicate normalized names', async () => {
  const f = fixture();
  try {
    const repo = new FinanceRepository(f.db);
    const input = { name: '  Tiền   mặt ', type: 'CASH', openingBalance: -125000, accountLabel: '', accountReference: '' };
    const wallet = await repo.createWallet('owner-a', input);
    assert.equal(wallet.owner_user_id, 'owner-a');
    assert.equal(wallet.opening_balance, -125000);
    assert.equal((await repo.listWallets('owner-b')).results.length, 0);
    await assert.rejects(() => repo.createWallet('owner-a', { ...input, name: 'TIỀN MẶT' }), { code: 'WALLET_NAME_EXISTS' });
    assert.equal(await repo.getWallet('owner-b', wallet.id), null);
    assert.equal(await repo.deleteWallet('owner-b', wallet.id), 'NOT_FOUND');
    assert.equal(await repo.deleteWallet('owner-a', wallet.id), 'DELETED');
  } finally { f.close(); }
});

test('categories seed per owner, support CRUD, and block deletion while referenced', async () => {
  const f = fixture();
  try {
    const repo = new FinanceRepository(f.db);
    const seeded = await repo.listCategories('owner-a');
    assert.equal(seeded.results.length, 12);
    assert.equal((await repo.listCategories('owner-b')).results.length, 12);
    const food = seeded.results.find((category) => category.name === 'Ăn uống');
    assert.ok(food);
    assert.equal(await repo.deleteCategory('owner-a', food.id), 'DEFAULT');
    const category = await repo.createCategory('owner-a', { name: 'Du lịch', type: 'EXPENSE' });
    await assert.rejects(() => repo.createCategory('owner-a', { name: ' DU   LỊCH ', type: 'EXPENSE' }), { code: 'CATEGORY_NAME_EXISTS' });
    const wallet = await repo.createWallet('owner-a', { name: 'Cash', type: 'CASH', openingBalance: 0, accountLabel: '', accountReference: '' });
    f.sql.prepare(`INSERT INTO transactions
      (id, owner_user_id, wallet_id, category_id, type, amount, occurred_at, note, tags_json, created_at, updated_at, deleted_at, revision)
      VALUES (?, ?, ?, ?, 'EXPENSE', 1, 1, '', '[]', 1, 1, NULL, 1)`)
      .run('tx-1', 'owner-a', wallet.id, category.id);
    assert.equal(await repo.deleteCategory('owner-a', category.id), 'IN_USE');
  } finally { f.close(); }
});
