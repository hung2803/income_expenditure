import { localDayBoundary } from './reporting-repository.ts';

interface SummaryRow { total_balance: number; income_this_month: number; expense_this_month: number }

export class FinanceSummaryRepository {
  private db: D1DatabaseSession;

  constructor(database: D1Database) { this.db = database.withSession('first-primary'); }

  async get(ownerUserId: string, timezone = 'UTC', now = Date.now()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit' })
      .formatToParts(new Date(now)).map((part) => [part.type, part.value]));
    const year = Number(parts.year); const month = Number(parts.month);
    const monthStartKey = `${parts.year}-${parts.month}-01`;
    const nextMonthKey = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthStart = localDayBoundary(monthStartKey, timezone);
    const nextMonthStart = localDayBoundary(nextMonthKey, timezone);
    const summary = await this.db.prepare(`SELECT
      COALESCE((SELECT SUM(w.opening_balance
        + COALESCE((SELECT SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE -t.amount END)
          FROM transactions t WHERE t.owner_user_id = w.owner_user_id AND t.wallet_id = w.id AND t.deleted_at IS NULL), 0)
        - COALESCE((SELECT SUM(tr.amount) FROM transfers tr WHERE tr.owner_user_id = w.owner_user_id AND tr.source_wallet_id = w.id), 0)
        + COALESCE((SELECT SUM(tr.amount) FROM transfers tr WHERE tr.owner_user_id = w.owner_user_id AND tr.destination_wallet_id = w.id), 0))
        FROM wallets w WHERE w.owner_user_id = ?), 0) AS total_balance,
      COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS income_this_month,
      COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expense_this_month
      FROM transactions t WHERE t.owner_user_id = ? AND t.deleted_at IS NULL
        AND t.occurred_at >= ? AND t.occurred_at < ?`)
      .bind(ownerUserId, ownerUserId, monthStart, nextMonthStart).first<SummaryRow>();

    const recent = await this.db.prepare(`SELECT * FROM (
      SELECT t.id, t.type, t.amount, t.occurred_at AS occurred_at, t.note AS note,
        w.name AS wallet_name, NULL AS destination_wallet_name
      FROM transactions t JOIN wallets w ON w.owner_user_id = t.owner_user_id AND w.id = t.wallet_id
      WHERE t.owner_user_id = ? AND t.deleted_at IS NULL
      UNION ALL
      SELECT tr.id, 'TRANSFER' AS type, tr.amount, tr.occurred_at AS occurred_at, '' AS note,
        sw.name AS wallet_name, dw.name AS destination_wallet_name
      FROM transfers tr JOIN wallets sw ON sw.owner_user_id = tr.owner_user_id AND sw.id = tr.source_wallet_id
      JOIN wallets dw ON dw.owner_user_id = tr.owner_user_id AND dw.id = tr.destination_wallet_id
      WHERE tr.owner_user_id = ?
    ) ORDER BY occurred_at DESC, id LIMIT 5`).bind(ownerUserId, ownerUserId).all<{
      id: string; type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amount: number; occurred_at: number;
      note: string; wallet_name: string; destination_wallet_name: string | null;
    }>();

    return {
      totalBalance: summary?.total_balance ?? 0,
      incomeThisMonth: summary?.income_this_month ?? 0,
      expenseThisMonth: summary?.expense_this_month ?? 0,
      recent: recent.results.map((row) => ({
        id: row.id, type: row.type, amount: row.amount, occurredAt: new Date(row.occurred_at).toISOString(),
        note: row.note, walletName: row.wallet_name,
        ...(row.destination_wallet_name === null ? {} : { destinationWalletName: row.destination_wallet_name })
      }))
    };
  }
}
