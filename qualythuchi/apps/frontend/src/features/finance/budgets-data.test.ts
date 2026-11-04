import { describe, expect, it } from 'vitest';
import type { ApiBudget, ApiTransaction } from '../../infrastructure/api/finance';
import { planBudgetCopy, shiftMonthKey, summarizeBudgetMonth } from './budgets-data';

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

describe('budget copy plan', () => {
  const at = (id: string, period: string, amount: number, categoryId: string | null): ApiBudget => ({ ...makeBudget(id, amount, categoryId), period });

  it('shifts month keys across years', () => {
    expect(shiftMonthKey('2026-11', 1)).toBe('2026-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
  });

  it('creates missing scopes and keeps existing ones unless overwriting', () => {
    const budgets = [at('total', '2026-06', 5_000_000, null), at('food', '2026-06', 2_000_000, 'food'), at('july-food', '2026-07', 1_500_000, 'food')];
    expect(planBudgetCopy(budgets, '2026-06', ['2026-07', '2026-08'], false)).toEqual({
      create: [
        { categoryId: null, period: '2026-07', amount: 5_000_000 },
        { categoryId: null, period: '2026-08', amount: 5_000_000 },
        { categoryId: 'food', period: '2026-08', amount: 2_000_000 }
      ],
      update: [],
      skipped: 1
    });
    const overwrite = planBudgetCopy(budgets, '2026-06', ['2026-07'], true);
    expect(overwrite.update).toEqual([{ id: 'july-food', input: { categoryId: 'food', period: '2026-07', amount: 2_000_000 } }]);
    expect(overwrite.skipped).toBe(0);
  });

  it('ignores the source month and empty sources', () => {
    expect(planBudgetCopy([], '2026-06', ['2026-07'], false)).toEqual({ create: [], update: [], skipped: 0 });
    expect(planBudgetCopy([at('total', '2026-06', 1, null)], '2026-06', ['2026-06'], true).create).toEqual([]);
  });
});
