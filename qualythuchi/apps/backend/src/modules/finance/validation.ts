import { AuthError } from '../auth/errors.ts';
import type { CategoryType, WalletType } from './repository.ts';

const invalid = () => new AuthError(400, 'INVALID_INPUT', 'Thông tin ví hoặc danh mục không hợp lệ.');

function onlyKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some((key) => !keys.includes(key))) throw invalid();
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function requiredName(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') throw invalid();
  const name = value.trim();
  if (!name || name.length > maxLength || hasControlCharacters(name)) throw invalid();
  return name;
}

function optionalText(value: unknown, maxLength: number): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > maxLength || hasControlCharacters(value)) throw invalid();
  return value.trim();
}

export interface WalletInput {
  name: string;
  type: WalletType;
  openingBalance: number;
  accountLabel: string;
  accountReference: string;
}

export function parseWalletInput(body: Record<string, unknown>): WalletInput {
  onlyKeys(body, ['name', 'type', 'openingBalance', 'accountLabel', 'accountReference']);
  if (body.type !== 'CASH' && body.type !== 'BANK' && body.type !== 'E_WALLET' && body.type !== 'OTHER') throw invalid();
  const openingBalance = body.openingBalance === undefined ? 0 : body.openingBalance;
  if (typeof openingBalance !== 'number' || !Number.isSafeInteger(openingBalance)) throw invalid();
  return {
    name: requiredName(body.name, 40),
    type: body.type as WalletType,
    openingBalance,
    accountLabel: optionalText(body.accountLabel, 30),
    accountReference: optionalText(body.accountReference, 40)
  };
}

export interface CategoryInput { name: string; type: CategoryType }

export function parseCategoryInput(body: Record<string, unknown>): CategoryInput {
  onlyKeys(body, ['name', 'type']);
  if (body.type !== 'EXPENSE' && body.type !== 'INCOME') throw invalid();
  return { name: requiredName(body.name, 32), type: body.type as CategoryType };
}

export interface BudgetInput { categoryId: string | null; period: string; amount: number }

export function parseBudgetInput(body: Record<string, unknown>): BudgetInput {
  onlyKeys(body, ['categoryId', 'period', 'amount']);
  const categoryId = body.categoryId === undefined || body.categoryId === null || body.categoryId === ''
    ? null : requiredName(body.categoryId, 128);
  if (typeof body.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(body.period)) throw invalid();
  if (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount <= 0) throw invalid();
  return { categoryId, period: body.period, amount: body.amount };
}

export interface TransactionInput {
  id?: string;
  type: CategoryType;
  amount: number;
  categoryId: string;
  walletId: string;
  occurredAt: number;
  note: string;
  tags: string[];
  revision?: number;
}

export interface TransferInput {
  id?: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number;
  occurredAt: number;
}

export function parseTransferInput(body: Record<string, unknown>): TransferInput {
  onlyKeys(body, ['id', 'sourceWalletId', 'destinationWalletId', 'amount', 'occurredAt']);
  if (body.id !== undefined && (typeof body.id !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/u.test(body.id))) throw invalid();
  if (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount <= 0) throw invalid();
  if (typeof body.occurredAt !== 'string' || body.occurredAt.length > 40 || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(body.occurredAt)) throw invalid();
  const occurredAt = Date.parse(body.occurredAt);
  if (!Number.isSafeInteger(occurredAt)) throw invalid();
  const sourceWalletId = requiredName(body.sourceWalletId, 128);
  const destinationWalletId = requiredName(body.destinationWalletId, 128);
  if (sourceWalletId === destinationWalletId) throw invalid();
  return {
    ...(body.id === undefined ? {} : { id: body.id as string }),
    sourceWalletId,
    destinationWalletId,
    amount: body.amount,
    occurredAt
  };
}

export function parseTransactionInput(body: Record<string, unknown>): TransactionInput {
  onlyKeys(body, ['id', 'type', 'amount', 'categoryId', 'walletId', 'occurredAt', 'note', 'tags', 'revision']);
  if (body.id !== undefined && (typeof body.id !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/u.test(body.id))) throw invalid();
  if (body.type !== 'EXPENSE' && body.type !== 'INCOME') throw invalid();
  if (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount) || body.amount <= 0) throw invalid();
  if (typeof body.occurredAt !== 'string' || body.occurredAt.length > 40 || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(body.occurredAt)) throw invalid();
  const occurredAt = Date.parse(body.occurredAt);
  if (!Number.isSafeInteger(occurredAt)) throw invalid();
  if (body.revision !== undefined && (typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision < 1)) throw invalid();
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > 8 || body.tags.some((tag) => typeof tag !== 'string' || tag.trim().length > 32 || hasControlCharacters(tag)))) throw invalid();
  const tags = [...new Set(((body.tags as string[] | undefined) ?? []).map((tag) => tag.trim()).filter(Boolean))];
  return {
    ...(body.id === undefined ? {} : { id: body.id as string }),
    type: body.type,
    amount: body.amount,
    categoryId: requiredName(body.categoryId, 128),
    walletId: requiredName(body.walletId, 128),
    occurredAt,
    note: optionalText(body.note, 200),
    tags,
    ...(body.revision === undefined ? {} : { revision: body.revision as number })
  };
}
