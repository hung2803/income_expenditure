import { userDataPrefix } from '../../infrastructure/auth/user-data';
import type { CategoryType } from './finance-data';

export type TransactionType = CategoryType;

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  walletId: string;
  occurredAt: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  revision?: number;
}

const storageSuffix = 'transactions-v1';

export function transactionStorageKey(userId: string): string {
  return `${userDataPrefix(userId)}${storageSuffix}`;
}

export function loadTransactions(userId: string): Transaction[] {
  try {
    const serialized = localStorage.getItem(transactionStorageKey(userId));
    if (!serialized) return [];
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    return value.filter(isTransaction).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  } catch {
    return [];
  }
}

export function saveTransactions(userId: string, transactions: Transaction[]): void {
  localStorage.setItem(transactionStorageKey(userId), JSON.stringify(transactions));
}

export function parseTransactionAmount(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(normalized)) return undefined;
  const amount = Number(normalized.replaceAll('.', ''));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

export function parseTransactionTags(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 8);
}

function isTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Transaction>;
  return typeof item.id === 'string'
    && (item.type === 'INCOME' || item.type === 'EXPENSE')
    && Number.isSafeInteger(item.amount) && (item.amount ?? 0) > 0
    && typeof item.categoryId === 'string'
    && typeof item.walletId === 'string'
    && typeof item.occurredAt === 'string'
    && typeof item.note === 'string'
    && Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string')
    && typeof item.createdAt === 'string'
    && typeof item.updatedAt === 'string';
}
