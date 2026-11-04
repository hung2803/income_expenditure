import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Executes production SQL on real SQLite. This adapter is for native unit
// tests only; CI browser tests additionally run the actual Workers/D1 runtime.
export function sqliteD1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for (const migration of ['0001_foundation.sql', '0002_auth.sql', '0003_finance_wallets_categories.sql', '0004_transactions.sql', '0005_transfers.sql', '0006_sync.sql', '0007_admin_audit_immutability.sql', '0008_p06_budgets.sql', '0009_p07_budget_threshold_events.sql', '0010_p08_notifications_passkeys.sql', '0011_p09_reports_search.sql', '0012_p10_savings_recurring.sql']) sql.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  let primaryReads = 0;
  const prepare = (query, parameters = []) => ({
    bind: (...values) => prepare(query, values),
    first: async () => sql.prepare(query).get(...parameters) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...parameters), success: true }),
    run: async () => execute(query, parameters),
    _execute: () => execute(query, parameters)
  });
  function execute(query, parameters) {
    const statement = sql.prepare(query);
    if (/\bRETURNING\b/i.test(query)) return { results: statement.all(...parameters), meta: { changes: Number(sql.prepare('SELECT changes() AS count').get().count) }, success: true };
    const result = statement.run(...parameters);
    return { results: [], meta: { changes: Number(result.changes) }, success: true };
  }
  const session = { prepare, batch: async (statements) => {
    sql.exec('BEGIN');
    try { const results = statements.map((statement) => statement._execute()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  const db = { ...session, withSession: (constraint) => {
    if (constraint !== 'first-primary') throw new Error('Auth must use the primary.');
    primaryReads++;
    return session;
  } };
  return { db, sql, primaryReads: () => primaryReads, close: () => sql.close() };
}
