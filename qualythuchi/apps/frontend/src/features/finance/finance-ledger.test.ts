import { describe, expect, it } from 'vitest';
import { calculateMonthlyTotals, calculateWalletBalances } from './finance-ledger';
import type { Transaction } from './transactions-data';
import type { Wallet } from './finance-data';

const wallets: Wallet[] = [
  { id: 'cash', name: 'Tiền mặt', type: 'CASH', openingBalance: 1_000_000, accountLabel: '', accountReference: '' },
  { id: 'bank', name: 'Ngân hàng', type: 'BANK', openingBalance: 500_000, accountLabel: '', accountReference: '' }
];

describe('finance ledger summaries', () => {
  it('applies income, expenses and transfers to the correct wallet balances', () => {
    const transactions: Transaction[] = [
      { id: 'income', type: 'INCOME', amount: 200_000, categoryId: 'salary', walletId: 'cash', occurredAt: '2026-10-04T00:00:00.000Z', note: '', tags: [], createdAt: '', updatedAt: '' },
      { id: 'expense', type: 'EXPENSE', amount: 50_000, categoryId: 'food', walletId: 'bank', occurredAt: '2026-10-05T00:00:00.000Z', note: '', tags: [], createdAt: '', updatedAt: '' }
    ];
    const transfers = [{ id: 'move', sourceWalletId: 'cash', destinationWalletId: 'bank', amount: 300_000, occurredAt: '', createdAt: '' }];

    expect(calculateWalletBalances(wallets, transactions, transfers)).toEqual(new Map([
      ['cash', 900_000],
      ['bank', 750_000]
    ]));
  });

  it('counts only income and expenses in the current month totals', () => {
    const transactions: Transaction[] = [
      { id: 'income', type: 'INCOME', amount: 200_000, categoryId: 'salary', walletId: 'cash', occurredAt: '2026-10-04T00:00:00.000Z', note: '', tags: [], createdAt: '', updatedAt: '' },
      { id: 'expense', type: 'EXPENSE', amount: 50_000, categoryId: 'food', walletId: 'bank', occurredAt: '2026-10-05T00:00:00.000Z', note: '', tags: [], createdAt: '', updatedAt: '' },
      { id: 'old', type: 'INCOME', amount: 100_000, categoryId: 'salary', walletId: 'cash', occurredAt: '2026-09-30T12:00:00.000Z', note: '', tags: [], createdAt: '', updatedAt: '' }
    ];
    expect(calculateMonthlyTotals(transactions, new Date('2026-10-22T00:00:00.000Z'))).toEqual({ income: 200_000, expense: 50_000 });
  });
});
