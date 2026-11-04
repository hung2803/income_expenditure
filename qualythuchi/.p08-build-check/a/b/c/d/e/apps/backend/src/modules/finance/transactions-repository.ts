import { AuthError, conflict } from '../auth/errors.ts';
import type { TransactionInput } from './validation.ts';

export interface TransactionRow {
  id: string;
  owner_user_id: string;
  wallet_id: string;
  category_id: string;
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  occurred_at: number;
  note: string;
  tags_json: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  revision: number;
  wallet_name?: string;
  category_name?: string;
}

export const transactionDto = (row: TransactionRow) => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  walletId: row.wallet_id,
  categoryId: row.category_id,
  type: row.type,
  amount: row.amount,
  occurredAt: new Date(row.occurred_at).toISOString(),
  note: row.note,
  tags: parseStoredTags(row.tags_json),
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
  deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at).toISOString(),
  revision: row.revision,
  ...(row.wallet_name === undefined ? {} : { walletName: row.wallet_name }),
  ...(row.category_name === undefined ? {} : { categoryName: row.category_name })
});

const transactionColumns = `t.id, t.owner_user_id, t.wallet_id, t.category_id, t.type, t.amount,
  t.occurred_at, t.note, t.tags_json, t.created_at, t.updated_at, t.deleted_at, t.revision,
  w.name AS wallet_name, c.name AS category_name`;

export class TransactionsRepository {
  private db: D1DatabaseSession;

  constructor(database: D1Database) { this.db = database.withSession('first-primary'); }

  async list(ownerUserId: string, options: { includeDeleted?: boolean; updatedAfter?: number } = {}) {
    const where = ['t.owner_user_id = ?'];
    const values: Array<string | number> = [ownerUserId];
    if (!options.includeDeleted) where.push('t.deleted_at IS NULL');
    if (options.updatedAfter !== undefined) { where.push('t.updated_at >= ?'); values.push(options.updatedAfter); }
    return this.db.prepare(`SELECT ${transactionColumns} FROM transactions t
      JOIN wallets w ON w.owner_user_id = t.owner_user_id AND w.id = t.wallet_id
      JOIN categories c ON c.owner_user_id = t.owner_user_id AND c.id = t.category_id
      WHERE ${where.join(' AND ')} ORDER BY t.occurred_at DESC, t.id`)
      .bind(...values).all<TransactionRow>();
  }

  async get(ownerUserId: string, id: string) {
    return this.db.prepare(`SELECT ${transactionColumns} FROM transactions t
      JOIN wallets w ON w.owner_user_id = t.owner_user_id AND w.id = t.wallet_id
      JOIN categories c ON c.owner_user_id = t.owner_user_id AND c.id = t.category_id
      WHERE t.owner_user_id = ? AND t.id = ?`)
      .bind(ownerUserId, id).first<TransactionRow>();
  }

  async create(ownerUserId: string, input: TransactionInput, now = Date.now()) {
    const id = input.id ?? crypto.randomUUID();
    const existing = input.id ? await this.get(ownerUserId, id) : null;
    if (existing) {
      if (existing.deleted_at === null && isSamePayload(existing, input)) return existing;
      throw conflict('TRANSACTION_ID_EXISTS', 'Mã giao dịch này đã được sử dụng.');
    }
    await this.validateReferences(ownerUserId, input);
    const before = await this.walletBalance(ownerUserId, input.walletId);
    ensureSafeBalance(before + contribution(input.type, input.amount));
    try {
      await this.db.prepare(`INSERT INTO transactions
        (id, owner_user_id, wallet_id, category_id, type, amount, occurred_at, note, tags_json, created_at, updated_at, deleted_at, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`)
        .bind(id, ownerUserId, input.walletId, input.categoryId, input.type, input.amount, input.occurredAt,
          input.note, JSON.stringify(input.tags), now, now).run();
    } catch (error) {
      const existing = await this.get(ownerUserId, id);
      if (existing && existing.deleted_at === null && isSamePayload(existing, input)) return existing;
      const text = error instanceof Error ? error.message : String(error);
      if (/UNIQUE constraint failed: transactions\./i.test(text)) throw conflict('TRANSACTION_ID_EXISTS', 'Mã giao dịch này đã được sử dụng.');
      throw error;
    }
    return this.get(ownerUserId, id);
  }

  async update(ownerUserId: string, id: string, input: TransactionInput, now = Date.now()) {
    const current = await this.get(ownerUserId, id);
    if (!current || current.deleted_at !== null) return null;
    if (input.revision !== undefined && input.revision !== current.revision) {
      throw conflict('REVISION_CONFLICT', 'Giao dịch đã được thay đổi. Tải lại rồi thử lần nữa.');
    }
    await this.validateReferences(ownerUserId, input);
    const oldEffect = contribution(current.type, current.amount);
    const newEffect = contribution(input.type, input.amount);
    const oldWalletBalance = await this.walletBalance(ownerUserId, current.wallet_id);
    if (current.wallet_id === input.walletId) ensureSafeBalance(oldWalletBalance - oldEffect + newEffect);
    else {
      const newWalletBalance = await this.walletBalance(ownerUserId, input.walletId);
      ensureSafeBalance(oldWalletBalance - oldEffect);
      ensureSafeBalance(newWalletBalance + newEffect);
    }
    const result = await this.db.prepare(`UPDATE transactions SET wallet_id = ?, category_id = ?, type = ?, amount = ?,
      occurred_at = ?, note = ?, tags_json = ?, updated_at = ?, revision = revision + 1
      WHERE owner_user_id = ? AND id = ? AND deleted_at IS NULL AND revision = ?`)
      .bind(input.walletId, input.categoryId, input.type, input.amount, input.occurredAt, input.note,
        JSON.stringify(input.tags), now, ownerUserId, id, current.revision).run();
    if (result.meta.changes === 0) throw conflict('REVISION_CONFLICT', 'Giao dịch đã được thay đổi. Tải lại rồi thử lần nữa.');
    return this.get(ownerUserId, id);
  }

  async delete(ownerUserId: string, id: string, now = Date.now()) {
    await this.db.prepare(`UPDATE transactions SET deleted_at = ?, updated_at = ?, revision = revision + 1
      WHERE owner_user_id = ? AND id = ? AND deleted_at IS NULL`).bind(now, now, ownerUserId, id).run();
    return this.get(ownerUserId, id);
  }

  async undo(ownerUserId: string, id: string, now = Date.now()) {
    const current = await this.get(ownerUserId, id);
    if (!current) return null;
    if (current.deleted_at === null) return current;
    if (current.deleted_at > now || current.deleted_at < now - 10_000) return 'EXPIRED' as const;
    const result = await this.db.prepare(`UPDATE transactions SET deleted_at = NULL, updated_at = ?, revision = revision + 1
      WHERE owner_user_id = ? AND id = ? AND deleted_at = ? AND revision = ?`)
      .bind(now, ownerUserId, id, current.deleted_at, current.revision).run();
    if (result.meta.changes === 0) throw conflict('REVISION_CONFLICT', 'Giao dịch đã được thay đổi. Tải lại rồi thử lần nữa.');
    return this.get(ownerUserId, id);
  }

  async walletBalance(ownerUserId: string, walletId: string): Promise<number> {
    const row = await this.db.prepare(`SELECT w.opening_balance
      + COALESCE((SELECT SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE -t.amount END)
        FROM transactions t WHERE t.owner_user_id = w.owner_user_id AND t.wallet_id = w.id AND t.deleted_at IS NULL), 0)
      - COALESCE((SELECT SUM(tr.amount) FROM transfers tr WHERE tr.owner_user_id = w.owner_user_id AND tr.source_wallet_id = w.id), 0)
      + COALESCE((SELECT SUM(tr.amount) FROM transfers tr WHERE tr.owner_user_id = w.owner_user_id AND tr.destination_wallet_id = w.id), 0) AS balance
      FROM wallets w WHERE w.owner_user_id = ? AND w.id = ?`)
      .bind(ownerUserId, walletId).first<{ balance: number }>();
    return row?.balance ?? 0;
  }

  private async validateReferences(ownerUserId: string, input: TransactionInput) {
    const wallet = await this.db.prepare('SELECT id FROM wallets WHERE owner_user_id = ? AND id = ?')
      .bind(ownerUserId, input.walletId).first<{ id: string }>();
    const category = await this.db.prepare('SELECT id, type FROM categories WHERE owner_user_id = ? AND id = ?')
      .bind(ownerUserId, input.categoryId).first<{ id: string; type: string }>();
    if (!wallet || !category || category.type !== input.type) {
      throw new AuthError(400, 'INVALID_REFERENCE', 'Ví hoặc danh mục không hợp lệ với giao dịch này.');
    }
  }
}

function contribution(type: 'EXPENSE' | 'INCOME', amount: number): number {
  return type === 'INCOME' ? amount : -amount;
}

function ensureSafeBalance(balance: number) {
  if (!Number.isSafeInteger(balance)) throw conflict('BALANCE_LIMIT', 'Số dư vượt quá giới hạn số nguyên VND an toàn.');
}

function isSamePayload(row: TransactionRow, input: TransactionInput): boolean {
  return row.type === input.type && row.amount === input.amount && row.wallet_id === input.walletId
    && row.category_id === input.categoryId && row.occurred_at === input.occurredAt && row.note === input.note
    && JSON.stringify(parseStoredTags(row.tags_json)) === JSON.stringify(input.tags);
}

function parseStoredTags(value: string): string[] {
  try {
    const tags: unknown = JSON.parse(value);
    return Array.isArray(tags) && tags.every((tag) => typeof tag === 'string') ? tags : [];
  } catch { return []; }
}
