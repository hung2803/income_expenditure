import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localMonthKey, summarizeBudgetMonth } from '../../frontend/src/features/finance/budgets-data.ts';

function budget(id, amount, categoryId) {
  return { id, ownerUserId: 'user-a', categoryId, categoryName: categoryId, period: '2026-06', amount, revision: 1, createdAt: 1, updatedAt: 1 };
}

function transaction(id, amount, categoryId, type = 'EXPENSE', occurredAt = '2026-06-15T10:00:00.000Z') {
  return { id, ownerUserId: 'user-a', categoryId, walletId: 'wallet', type, amount, occurredAt, createdAt: occurredAt, updatedAt: occurredAt, deletedAt: null, revision: 1, note: '', tags: [] };
}

test('budget overview counts all expenses for a total budget and computes category progress', () => {
  const result = summarizeBudgetMonth('2026-06', [budget('total', 1_000_000, null), budget('food', 300_000, 'food')], [
    transaction('food-expense', 240_000, 'food'), transaction('other-expense', 110_000, 'other'), transaction('income', 900_000, 'income', 'INCOME')
  ]);
  assert.deepEqual({ budgetTotal: result.budgetTotal, spent: result.spent, remaining: result.remaining, percentUsed: result.percentUsed, hasTotalBudget: result.hasTotalBudget }, {
    budgetTotal: 1_000_000, spent: 350_000, remaining: 650_000, percentUsed: 35, hasTotalBudget: true
  });
  assert.deepEqual({ spent: result.categories[0].spent, remaining: result.categories[0].remaining, percentUsed: result.categories[0].percentUsed }, { spent: 240_000, remaining: 60_000, percentUsed: 80 });
});

test('without a total budget, summary includes only expenses in budgeted categories', () => {
  const result = summarizeBudgetMonth('2026-06', [budget('food', 300_000, 'food'), budget('travel', 200_000, 'travel')], [
    transaction('food-expense', 240_000, 'food'), transaction('unbudgeted-expense', 80_000, 'other'), transaction('last-month', 99_000, 'food', 'EXPENSE', '2026-05-15T10:00:00.000Z')
  ]);
  assert.deepEqual({ budgetTotal: result.budgetTotal, spent: result.spent, remaining: result.remaining, percentUsed: result.percentUsed }, {
    budgetTotal: 500_000, spent: 240_000, remaining: 260_000, percentUsed: 48
  });
});

test('month key follows the device local calendar', () => {
  const date = new Date(2026, 8, 1);
  assert.equal(localMonthKey(date), '2026-09');
});
