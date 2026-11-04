import { conflict } from '../auth/errors.ts';
import type { CategoryInput, WalletInput } from './validation.ts';

export type WalletType = 'CASH' | 'BANK' | 'E_WALLET' | 'OTHER';
export type CategoryType = 'EXPENSE' | 'INCOME';

export interface WalletRow {
  id: string;
  owner_user_id: string;
  name: string;
  type: WalletType;
  opening_balance: number;
  current_balance?: number;
  account_label: string;
  account_reference: string;
  created_at: number;
  updated_at: number;
}

export interface CategoryRow {
  id: string;
  owner_user_id: string;
  name: string;
  type: CategoryType;
  is_default: number;
  created_at: number;
  updated_at: number;
}

export const walletDto = (row: WalletRow) => ({
  id: row.id, ownerUserId: row.owner_user_id, name: row.name, type: row.type,
  openingBalance: row.opening_balance, accountLabel: row.account_label,
  currentBalance: row.current_balance ?? row.opening_balance,
  accountReference: row.account_reference, createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString()
});

export const categoryDto = (row: CategoryRow) => ({
  id: row.id, ownerUserId: row.owner_user_id, name: row.name, type: row.type,
  isDefault: Boolean(row.is_default), createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString()
});

const DEFAULT_CATEGORIES: Array<{ id: string; name: string; type: CategoryType }> = [
  { id: 'expense-food', name: 'Ăn uống', type: 'EXPENSE' },
  { id: 'expense-shopping', name: 'Mua sắm', type: 'EXPENSE' },
  { id: 'expense-housing', name: 'Tiền nhà', type: 'EXPENSE' },
  { id: 'expense-transport', name: 'Di chuyển', type: 'EXPENSE' },
  { id: 'expense-health', name: 'Sức khỏe', type: 'EXPENSE' },
  { id: 'expense-learning', name: 'Học tập', type: 'EXPENSE' },
  { id: 'expense-entertainment', name: 'Giải trí', type: 'EXPENSE' },
  { id: 'expense-other', name: 'Khác', type: 'EXPENSE' },
  { id: 'income-salary', name: 'Lương', type: 'INCOME' },
  { id: 'income-bonus', name: 'Thưởng', type: 'INCOME' },
  { id: 'income-investment', name: 'Đầu tư', type: 'INCOME' },
  { id: 'income-other', name: 'Khác', type: 'INCOME' }
];

export function normalizeResourceName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
}

export class FinanceRepository {
  private db: D1DatabaseSession;

  constructor(database: D1Database) { this.db = database.withSession('first-primary'); }

  listWallets(ownerUserId: string) {
    return this.db.prepare(`SELECT w.id, w.owner_user_id, w.name, w.type, w.opening_balance, w.account_label,
      w.account_reference, w.created_at, w.updated_at, ${walletBalanceSql}
      FROM wallets w WHERE w.owner_user_id = ? ORDER BY w.created_at, w.id`).bind(ownerUserId).all<WalletRow>();
  }

  getWallet(ownerUserId: string, id: string) {
    return this.db.prepare(`SELECT w.id, w.owner_user_id, w.name, w.type, w.opening_balance, w.account_label,
      w.account_reference, w.created_at, w.updated_at, ${walletBalanceSql}
      FROM wallets w WHERE w.owner_user_id = ? AND w.id = ?`)
      .bind(ownerUserId, id).first<WalletRow>();
  }

  async createWallet(ownerUserId: string, input: WalletInput, now = Date.now()) {
    const id = crypto.randomUUID();
    try {
      await this.db.prepare(`INSERT INTO wallets (id, owner_user_id, name, normalized_name, type,
        opening_balance, account_label, account_reference, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, ownerUserId, input.name, normalizeResourceName(input.name), input.type,
          input.openingBalance, input.accountLabel, input.accountReference, now, now).run();
    } catch (error) { throw mapUniqueConflict(error, 'WALLET_NAME_EXISTS', 'Tên ví này đã được sử dụng.'); }
    return this.getWallet(ownerUserId, id);
  }

  async updateWallet(ownerUserId: string, id: string, input: WalletInput, now = Date.now()) {
    const current = await this.getWallet(ownerUserId, id);
    if (!current) return null;
    const projectedBalance = current.current_balance! - current.opening_balance + input.openingBalance;
    if (!Number.isSafeInteger(projectedBalance)) throw conflict('BALANCE_LIMIT', 'Số dư vượt quá giới hạn số nguyên VND an toàn.');
    try {
      const result = await this.db.prepare(`UPDATE wallets SET name = ?, normalized_name = ?, type = ?,
        opening_balance = ?, account_label = ?, account_reference = ?, updated_at = ?
        WHERE owner_user_id = ? AND id = ?`)
        .bind(input.name, normalizeResourceName(input.name), input.type, input.openingBalance,
          input.accountLabel, input.accountReference, now, ownerUserId, id).run();
      if (result.meta.changes === 0) return null;
    } catch (error) { throw mapUniqueConflict(error, 'WALLET_NAME_EXISTS', 'Tên ví này đã được sử dụng.'); }
    return this.getWallet(ownerUserId, id);
  }

  async deleteWallet(ownerUserId: string, id: string): Promise<'NOT_FOUND' | 'IN_USE' | 'DELETED'> {
    const wallet = await this.getWallet(ownerUserId, id);
    if (!wallet) return 'NOT_FOUND';
    if (await this.referenced('transactions', ['wallet_id'], id) || await this.referenced('transfers', ['source_wallet_id', 'destination_wallet_id'], id)) return 'IN_USE';
    const result = await this.db.prepare('DELETE FROM wallets WHERE owner_user_id = ? AND id = ?').bind(ownerUserId, id).run();
    return result.meta.changes ? 'DELETED' : 'NOT_FOUND';
  }

  async listCategories(ownerUserId: string) {
    await this.ensureDefaultCategories(ownerUserId);
    return this.db.prepare(`SELECT id, owner_user_id, name, type, is_default, created_at, updated_at
      FROM categories WHERE owner_user_id = ? ORDER BY type, is_default DESC, created_at, id`)
      .bind(ownerUserId).all<CategoryRow>();
  }

  async getCategory(ownerUserId: string, id: string) {
    return this.db.prepare(`SELECT id, owner_user_id, name, type, is_default, created_at, updated_at
      FROM categories WHERE owner_user_id = ? AND id = ?`).bind(ownerUserId, id).first<CategoryRow>();
  }

  async createCategory(ownerUserId: string, input: CategoryInput, now = Date.now()) {
    const id = crypto.randomUUID();
    try {
      await this.db.prepare(`INSERT INTO categories (id, owner_user_id, type, name, normalized_name,
        is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
        .bind(id, ownerUserId, input.type, input.name, normalizeResourceName(input.name), now, now).run();
    } catch (error) { throw mapUniqueConflict(error, 'CATEGORY_NAME_EXISTS', 'Tên danh mục này đã được dùng trong cùng nhóm.'); }
    return this.getCategory(ownerUserId, id);
  }

  async updateCategory(ownerUserId: string, id: string, input: CategoryInput, now = Date.now()) {
    try {
      const result = await this.db.prepare(`UPDATE categories SET type = ?, name = ?, normalized_name = ?, updated_at = ?
        WHERE owner_user_id = ? AND id = ?`)
        .bind(input.type, input.name, normalizeResourceName(input.name), now, ownerUserId, id).run();
      if (result.meta.changes === 0) return null;
    } catch (error) { throw mapUniqueConflict(error, 'CATEGORY_NAME_EXISTS', 'Tên danh mục này đã được dùng trong cùng nhóm.'); }
    return this.getCategory(ownerUserId, id);
  }

  async deleteCategory(ownerUserId: string, id: string): Promise<'NOT_FOUND' | 'IN_USE' | 'DEFAULT' | 'DELETED'> {
    const category = await this.getCategory(ownerUserId, id);
    if (!category) return 'NOT_FOUND';
    if (category.is_default) return 'DEFAULT';
    if (await this.referenced('transactions', ['category_id'], id)) return 'IN_USE';
    const result = await this.db.prepare('DELETE FROM categories WHERE owner_user_id = ? AND id = ? AND is_default = 0').bind(ownerUserId, id).run();
    return result.meta.changes ? 'DELETED' : 'NOT_FOUND';
  }

  private async ensureDefaultCategories(ownerUserId: string) {
    const now = Date.now();
    await this.db.batch(DEFAULT_CATEGORIES.map((category) => this.db.prepare(`INSERT OR IGNORE INTO categories
      (id, owner_user_id, type, name, normalized_name, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(`${ownerUserId}:${category.id}`, ownerUserId, category.type, category.name, normalizeResourceName(category.name), now, now)));
  }

  private async referenced(table: 'transactions' | 'transfers', columns: string[], id: string): Promise<boolean> {
    const exists = await this.db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .bind(table).first<{ found: number }>();
    if (!exists) return false;
    for (const column of columns) {
      const reference = await this.db.prepare(`SELECT 1 AS found FROM ${table} WHERE ${column} = ? LIMIT 1`).bind(id).first<{ found: number }>();
      if (reference) return true;
    }
    return false;
  }
}

const walletBalanceSql = `w.opening_balance
  + COALESCE((SELECT SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE -t.amount END)
      FROM transactions t WHERE t.owner_user_id = w.owner_user_id AND t.wallet_id = w.id AND t.deleted_at IS NULL), 0)
  - COALESCE((SELECT SUM(tr.amount) FROM transfers tr WHERE tr.owner_user_id = w.owner_user_id AND tr.source_wallet_id = w.id), 0)
  + COALESCE((SELECT SUM(tr.amount) FROM transfers tr WHERE tr.owner_user_id = w.owner_user_id AND tr.destination_wallet_id = w.id), 0)
  AS current_balance`;

function mapUniqueConflict(error: unknown, code: string, message: string): unknown {
  const text = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed: (wallets|categories)\./i.test(text) ? conflict(code, message) : error;
}
