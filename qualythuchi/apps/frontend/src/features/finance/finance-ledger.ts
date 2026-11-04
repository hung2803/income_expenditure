import { userDataPrefix } from '../../infrastructure/auth/user-data';
import type { Transaction } from './transactions-data';
import type { Wallet } from './finance-data';

export interface WalletTransfer {
  id: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number;
  occurredAt: string;
  createdAt: string;
}

const transferStorageSuffix = 'transfers-v1';

export function transferStorageKey(userId: string): string {
  return `${userDataPrefix(userId)}${transferStorageSuffix}`;
}

export function loadTransfers(userId: string): WalletTransfer[] {
  try {
    const serialized = localStorage.getItem(transferStorageKey(userId));
    if (!serialized) return [];
    const value: unknown = JSON.parse(serialized);
    return Array.isArray(value) ? value.filter(isTransfer).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) : [];
  } catch {
    return [];
  }
}

export function saveTransfers(userId: string, transfers: WalletTransfer[]): void {
  localStorage.setItem(transferStorageKey(userId), JSON.stringify(transfers));
}

export function calculateWalletBalances(wallets: Wallet[], transactions: Transaction[], transfers: WalletTransfer[]): Map<string, number> {
  const balances = new Map(wallets.map((wallet) => [wallet.id, wallet.openingBalance]));
  for (const transaction of transactions) {
    const current = balances.get(transaction.walletId);
    if (current === undefined) continue;
    balances.set(transaction.walletId, current + (transaction.type === 'INCOME' ? transaction.amount : -transaction.amount));
  }
  for (const transfer of transfers) {
    const source = balances.get(transfer.sourceWalletId);
    const destination = balances.get(transfer.destinationWalletId);
    if (source !== undefined) balances.set(transfer.sourceWalletId, source - transfer.amount);
    if (destination !== undefined) balances.set(transfer.destinationWalletId, destination + transfer.amount);
  }
  return balances;
}

export function calculateMonthlyTotals(transactions: Transaction[], now = new Date()): { income: number; expense: number } {
  return transactions.reduce((totals, transaction) => {
    const date = new Date(transaction.occurredAt);
    if (date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return totals;
    if (transaction.type === 'INCOME') totals.income += transaction.amount;
    else totals.expense += transaction.amount;
    return totals;
  }, { income: 0, expense: 0 });
}

function isTransfer(value: unknown): value is WalletTransfer {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WalletTransfer>;
  return typeof item.id === 'string'
    && typeof item.sourceWalletId === 'string'
    && typeof item.destinationWalletId === 'string'
    && Number.isSafeInteger(item.amount) && (item.amount ?? 0) > 0
    && typeof item.occurredAt === 'string'
    && typeof item.createdAt === 'string';
}
