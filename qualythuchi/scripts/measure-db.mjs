// Read production repository SQL against an isolated in-memory SQLite fixture.
// This measures query CPU, not Workers/D1 transport or production database load.
import { sqliteD1 } from '../apps/backend/test/sqlite-d1.mjs';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import { FinanceRepository } from '../apps/backend/src/modules/finance/repository.ts';
import { FinanceSummaryRepository } from '../apps/backend/src/modules/finance/summary-repository.ts';
import { TransactionsRepository } from '../apps/backend/src/modules/finance/transactions-repository.ts';
import { FinanceReportingRepository, parseTransactionSearchOptions } from '../apps/backend/src/modules/finance/reporting-repository.ts';

const fixture = sqliteD1();
try {
  fixture.sql.prepare("INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at) VALUES ('perf', 'perf', 'Perf', 'USER', 'unused', 1, 1)").run();
  const repo = new FinanceRepository(fixture.db);
  const categories = (await repo.listCategories('perf')).results;
  const wallet = await repo.createWallet('perf', { name: 'Perf', type: 'CASH', openingBalance: 10000000, accountLabel: '', accountReference: '' });
  const insert = fixture.sql.prepare("INSERT INTO transactions (id, owner_user_id, wallet_id, category_id, type, amount, occurred_at, note, tags_json, created_at, updated_at, deleted_at, revision) VALUES (?, 'perf', ?, ?, 'EXPENSE', 1000, ?, '', '[]', 1, 1, NULL, 1)");
  for (let index = 0; index < 1000; index++) insert.run(`perf-${index}`, wallet.id, categories.find(c => c.type === 'EXPENSE').id, Date.now() - index * 60000);
  let queryMs = 0; let queryCount = 0;
  const prepare = fixture.sql.prepare.bind(fixture.sql);
  fixture.sql.prepare = (query) => {
    const statement = prepare(query);
    return new Proxy(statement, { get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return (...args) => {
        const start = performance.now();
        try { return value.apply(target, args); }
        finally { if (['get', 'all', 'run'].includes(key)) { queryMs += performance.now() - start; queryCount++; } }
      };
    } });
  };
  const report = new FinanceReportingRepository(fixture.db);
  const now = new Date();
  const options = { from: `${now.getUTCFullYear()}-01-01`, to: `${now.getUTCFullYear()}-12-31`, timezone: 'Asia/Bangkok', bucket: 'month' };
  const rows = [];
  for (const [name, read] of [
    ['summary', () => new FinanceSummaryRepository(fixture.db).get('perf', 'Asia/Bangkok')],
    ['wallets', () => repo.listWallets('perf')],
    ['transactions', () => new TransactionsRepository(fixture.db).list('perf')],
    ['report', () => report.getReport('perf', options)],
    ['search', () => report.searchTransactions('perf', parseTransactionSearchOptions(options))]
  ]) {
    queryMs = 0; queryCount = 0;
    const start = performance.now();
    for (let repeat = 0; repeat < 20; repeat++) await read();
    rows.push({ name, repetitions: 20, meanRepositoryMs: (performance.now() - start) / 20, meanQueryMs: queryMs / 20, queriesPerRead: queryCount / 20 });
  }
  console.log(JSON.stringify({ environment: 'Node SQLite in-memory; 1000 synthetic transactions; no dev database writes', rows }, null, 2));
} finally { fixture.close(); }
