import { AuthError, conflict } from '../auth/errors.ts';
import type { TransferInput } from './validation.ts';

export interface TransferRow {
  id: string;
  owner_user_id: string;
  source_wallet_id: string;
  destination_wallet_id: string;
  type: 'TRANSFER';
  amount: number;
  occurred_at: number;
  created_at: number;
  revision: number;
  source_wallet_name?: string;
  destination_wallet_name?: string;
}

export const transferDto = (row: TransferRow) => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  sourceWalletId: row.source_wallet_id,
  destinationWalletId: row.destination_wallet_id,
  type: row.type,
  amount: row.amount,
  occurredAt: new Date(row.occurred_at).toISOString(),
  createdAt: new Date(row.created_at).toISOString(),
  revision: row.revision,
  ...(row.source_wallet_name === undefined ? {} : { sourceWalletName: row.source_wallet_name }),
  ...(row.destination_wallet_name === undefined ? {} : { destinationWalletName: row.destination_wallet_name })
});

const transferColumns = `tr.id, tr.owner_user_id, tr.source_wallet_id, tr.destination_wallet_id, tr.type,
  tr.amount, tr.occurred_at, tr.created_at, tr.revision,
  sw.name AS source_wallet_name, dw.name AS destination_wallet_name`;

export class TransfersRepository {
  private db: D1DatabaseSession;

  constructor(database: D1Database) { this.db = database.withSession('first-primary'); }

  async list(ownerUserId: string) {
    return this.db.prepare(`SELECT ${transferColumns} FROM transfers tr
      JOIN wallets sw ON sw.owner_user_id = tr.owner_user_id AND sw.id = tr.source_wallet_id
      JOIN wallets dw ON dw.owner_user_id = tr.owner_user_id AND dw.id = tr.destination_wallet_id
      WHERE tr.owner_user_id = ? ORDER BY tr.occurred_at DESC, tr.id`).bind(ownerUserId).all<TransferRow>();
  }

  async create(ownerUserId: string, input: TransferInput, now = Date.now()) {
    const id = input.id ?? crypto.randomUUID();
    if (input.id) {
      const existing = await this.get(ownerUserId, id);
      if (existing) {
        if (samePayload(existing, input)) return existing;
        throw conflict('TRANSFER_ID_EXISTS', 'Mã chuyển tiền này đã được sử dụng.');
      }
    }
    const wallets = await this.db.prepare(`SELECT id FROM wallets WHERE owner_user_id = ? AND id IN (?, ?)`)
      .bind(ownerUserId, input.sourceWalletId, input.destinationWalletId).all<{ id: string }>();
    if (wallets.results.length !== 2) throw new AuthError(400, 'INVALID_REFERENCE', 'Ví nguồn hoặc ví đích không hợp lệ.');

    // A transfer is one immutable ledger row. D1 batch commits the row atomically,
    // so its debit and credit become visible together when balances are derived.
    try {
      await this.db.batch([this.db.prepare(`INSERT INTO transfers
        (id, owner_user_id, source_wallet_id, destination_wallet_id, type, amount, occurred_at, created_at, revision)
        VALUES (?, ?, ?, ?, 'TRANSFER', ?, ?, ?, 1)`)
        .bind(id, ownerUserId, input.sourceWalletId, input.destinationWalletId, input.amount, input.occurredAt, now)]);
    } catch (error) {
      const existing = await this.get(ownerUserId, id);
      if (existing && input.id && samePayload(existing, input)) return existing;
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE constraint failed: transfers\./i.test(message)) throw conflict('TRANSFER_ID_EXISTS', 'Mã chuyển tiền này đã được sử dụng.');
      throw error;
    }
    return this.get(ownerUserId, id);
  }

  private get(ownerUserId: string, id: string) {
    return this.db.prepare(`SELECT ${transferColumns} FROM transfers tr
      JOIN wallets sw ON sw.owner_user_id = tr.owner_user_id AND sw.id = tr.source_wallet_id
      JOIN wallets dw ON dw.owner_user_id = tr.owner_user_id AND dw.id = tr.destination_wallet_id
      WHERE tr.owner_user_id = ? AND tr.id = ?`).bind(ownerUserId, id).first<TransferRow>();
  }
}

function samePayload(row: TransferRow, input: TransferInput) {
  return row.source_wallet_id === input.sourceWalletId && row.destination_wallet_id === input.destinationWalletId
    && row.amount === input.amount && row.occurred_at === input.occurredAt;
}
