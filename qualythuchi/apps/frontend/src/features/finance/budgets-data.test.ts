import { describe, expect, it } from 'vitest';
import type { ApiBudget, ApiTransaction } from '../../infrastructure/api/finance';
import { summarizeBudgetMonth } from './budgets-data';

const makeBudget = (id: string, amount: number, categoryId: string | null): ApiBudget => ({
  id, ownerUserId: 'user-a', categoryId, categoryName: categoryId, period: '2026-06', amount,
  revision: 1, createdAt: 1, updatedAt: 1
});
const makeTransaction = (id: string, amount: number, categoryId: string, type: ApiTransaction['type'] = 'EXPENSE'): ApiTransaction => ({
  id, ownerUserId: 'user-a', categoryId, walletId: 'wallet', type, amount,
  occurredAt: '2026-06-15T10:00:00.000Z', note: '', tags: [], createdAt: '2026-06-15T10:00:00.000Z',
  updatedAt: '2026-06-15T10:00:00.000Z', deletedAt: null, revision: 1
});

describe('budget month summary', () => {
  it('summarizes total budget, all expenses, remaining money and category progress', () => {
    const summary = summarizeBudgetMonth('2026-06', [makeBudget('total', 1_000_000, null), makeBudget('food', 300_000, 'food')], [
      makeTransaction('food-expense', 240_000, 'food'), makeTransaction('other-expense', 110_000, 'other'), makeTransaction('income', 900_000, 'income', 'INCOME')
    ]);
    expect(summary).toMatchObject({ budgetTotal: 1_000_000, spent: 350_000, remaining: 650_000, percentUsed: 35, hasTotalBudget: true });
    expect(summary.categories[0]).toMatchObject({ spent: 240_000, remaining: 60_000, percentUsed: 80 });
  });

  it('uses the sum of category budgets and their matching spending when no total budget exists', () => {
    const summary = summarizeBudgetMonth('2026-06', [makeBudget('food', 300_000, 'food'), makeBudget('travel', 200_000, 'travel')], [
      makeTransaction('food-expense', 240_000, 'food'), makeTransaction('unbudgeted-expense', 80_000, 'other')
    ]);
    expect(summary).toMatchObject({ budgetTotal: 500_000, spent: 240_000, remaining: 260_000, percentUsed: 48, hasTotalBudget: false });
  });
});
