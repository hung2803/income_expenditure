import { Hono } from 'hono';
import type { AuthEnvironment } from '../../middleware/auth';
import { requireAuth, requireCsrf, scopeOwner } from '../../middleware/auth';
import { AuthError } from '../auth/errors';
import { jsonBody } from '../auth/validation';
import { FinanceRepository, categoryDto, walletDto } from './repository';
import { TransactionsRepository, transactionDto } from './transactions-repository';
import { FinanceSummaryRepository } from './summary-repository';
import { FinanceReportingRepository, parseReportOptions, parseTransactionSearchOptions } from './reporting-repository';
import { BudgetsRepository } from './budgets-repository';
import { TransfersRepository, transferDto } from './transfers-repository';
import { parseBudgetInput, parseCategoryInput, parseTransactionInput, parseTransferInput, parseWalletInput } from './validation';
import { recordAdminFinanceChange } from '../users/audit';

export const financeRoutes = new Hono<AuthEnvironment>();

const walletCollection = '/users/:ownerUserId/wallets';
const walletItem = '/users/:ownerUserId/wallets/:walletId';
const categoryCollection = '/users/:ownerUserId/categories';
const categoryItem = '/users/:ownerUserId/categories/:categoryId';
const transactionCollection = '/users/:ownerUserId/transactions';
const transactionItem = '/users/:ownerUserId/transactions/:transactionId';
const transferCollection = '/users/:ownerUserId/transfers';
const summaryPath = '/users/:ownerUserId/summary';
const reportSummaryPath = '/users/:ownerUserId/reports/summary';
const budgetCollection = '/users/:ownerUserId/budgets';
const budgetItem = '/users/:ownerUserId/budgets/:budgetId';
const budgetSummaryPath = '/users/:ownerUserId/budgets/summary';

interface BudgetRow {
  id: string; owner_user_id: string; category_id: string | null; category_name: string | null;
  period: string; amount: number; revision: number; created_at: number; updated_at: number;
}
const budgetDto = (row: BudgetRow) => ({ id: row.id, ownerUserId: row.owner_user_id, categoryId: row.category_id,
  categoryName: row.category_name, period: row.period, amount: row.amount, revision: row.revision,
  createdAt: row.created_at, updatedAt: row.updated_at });
const budgetSelect = `SELECT b.id,b.owner_user_id,b.category_id,c.name AS category_name,b.period,b.amount,b.revision,b.created_at,b.updated_at
  FROM budgets b LEFT JOIN categories c ON c.owner_user_id=b.owner_user_id AND c.id=b.category_id`;

financeRoutes.get(budgetCollection, requireAuth, scopeOwner, async (c) => {
  const result = await c.env.DB.prepare(`${budgetSelect} WHERE b.owner_user_id=? ORDER BY b.period DESC, b.category_id, b.id`)
    .bind(c.get('ownerUserId')).all<BudgetRow>();
  return c.json({ budgets: result.results.map(budgetDto) });
});

financeRoutes.get(budgetSummaryPath, requireAuth, scopeOwner, async (c) => {
  const period = c.req.query('period') ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(period)) {
    throw new AuthError(400, 'INVALID_INPUT', 'Kỳ ngân sách cần theo định dạng YYYY-MM.');
  }
  return c.json(await new BudgetsRepository(c.env.DB).getSummary(c.get('ownerUserId'), period));
});

financeRoutes.post(budgetCollection, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const ownerUserId = c.get('ownerUserId');
  const input = parseBudgetInput(await jsonBody(c.req.raw));
  if (input.categoryId) {
    const category = await c.env.DB.prepare("SELECT id FROM categories WHERE owner_user_id=? AND id=? AND type='EXPENSE'")
      .bind(ownerUserId, input.categoryId).first<{ id: string }>();
    if (!category) throw new AuthError(400, 'INVALID_INPUT', 'Danh mục ngân sách phải là danh mục chi của tài khoản này.');
  }
  const id = crypto.randomUUID(); const now = Date.now();
  try {
    await c.env.DB.prepare(`INSERT INTO budgets(id,owner_user_id,category_id,period,amount,scope_key,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id, ownerUserId, input.categoryId, input.period, input.amount, input.categoryId ?? '', now, now).run();
  } catch (error) {
    if (/UNIQUE constraint failed: budgets\.owner_user_id, budgets\.period, budgets\.scope_key/i.test(error instanceof Error ? error.message : String(error))) {
      throw new AuthError(409, 'BUDGET_EXISTS', 'Ngân sách cùng kỳ và phạm vi đã tồn tại.');
    }
    throw error;
  }
  const row = await c.env.DB.prepare(`${budgetSelect} WHERE b.owner_user_id=? AND b.id=?`).bind(ownerUserId, id).first<BudgetRow>();
  const budget = budgetDto(row!);
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, ownerUserId, 'budget', id, 'CREATE', budget);
  return c.json({ budget }, 201);
});

financeRoutes.put(budgetItem, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const ownerUserId = c.get('ownerUserId'); const budgetId = c.req.param('budgetId');
  const input = parseBudgetInput(await jsonBody(c.req.raw));
  const before = await c.env.DB.prepare(`${budgetSelect} WHERE b.owner_user_id=? AND b.id=?`).bind(ownerUserId, budgetId).first<BudgetRow>();
  if (!before) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy ngân sách.');
  if (input.categoryId) {
    const category = await c.env.DB.prepare("SELECT id FROM categories WHERE owner_user_id=? AND id=? AND type='EXPENSE'")
      .bind(ownerUserId, input.categoryId).first<{ id: string }>();
    if (!category) throw new AuthError(400, 'INVALID_INPUT', 'Danh mục ngân sách phải là danh mục chi của tài khoản này.');
  }
  const now = Date.now();
  try {
    await c.env.DB.prepare(`UPDATE budgets SET category_id=?,period=?,amount=?,scope_key=?,revision=revision+1,updated_at=? WHERE owner_user_id=? AND id=?`)
      .bind(input.categoryId, input.period, input.amount, input.categoryId ?? '', now, ownerUserId, budgetId).run();
  } catch (error) {
    if (/UNIQUE constraint failed: budgets\.owner_user_id, budgets\.period, budgets\.scope_key/i.test(error instanceof Error ? error.message : String(error))) {
      throw new AuthError(409, 'BUDGET_EXISTS', 'Ngân sách cùng kỳ và phạm vi đã tồn tại.');
    }
    throw error;
  }
  const row = await c.env.DB.prepare(`${budgetSelect} WHERE b.owner_user_id=? AND b.id=?`).bind(ownerUserId, budgetId).first<BudgetRow>();
  const budget = budgetDto(row!);
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, ownerUserId, 'budget', budgetId, 'UPDATE', budget);
  return c.json({ budget });
});

financeRoutes.delete(budgetItem, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const ownerUserId = c.get('ownerUserId'); const budgetId = c.req.param('budgetId');
  const before = await c.env.DB.prepare(`${budgetSelect} WHERE b.owner_user_id=? AND b.id=?`).bind(ownerUserId, budgetId).first<BudgetRow>();
  if (!before) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy ngân sách.');
  await c.env.DB.prepare('DELETE FROM budgets WHERE owner_user_id=? AND id=?').bind(ownerUserId, budgetId).run();
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, ownerUserId, 'budget', budgetId, 'DELETE', budgetDto(before));
  return c.body(null, 204);
});

financeRoutes.get(summaryPath, requireAuth, scopeOwner, async (c) => {
  const timezone = c.req.query('timezone') ?? 'UTC';
  if (!timezone || timezone.length > 64) throw new AuthError(400, 'INVALID_INPUT', 'Múi giờ không hợp lệ.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
  catch { throw new AuthError(400, 'INVALID_INPUT', 'Múi giờ không hợp lệ.'); }
  return c.json(await new FinanceSummaryRepository(c.env.DB).get(c.get('ownerUserId'), timezone));
});

financeRoutes.get(reportSummaryPath, requireAuth, scopeOwner, async (c) => {
  const options = parseReportOptions(c.req.query());
  return c.json(await new FinanceReportingRepository(c.env.DB).getReport(c.get('ownerUserId'), options));
});

financeRoutes.get(transferCollection, requireAuth, scopeOwner, async (c) => {
  const result = await new TransfersRepository(c.env.DB).list(c.get('ownerUserId'));
  return c.json({ transfers: result.results.map(transferDto) });
});

financeRoutes.post(transferCollection, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const input = parseTransferInput(await jsonBody(c.req.raw));
  const transfer = await new TransfersRepository(c.env.DB).create(c.get('ownerUserId'), input);
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'transfer', transfer!.id, 'CREATE', transferDto(transfer!));
  return c.json({ transfer: transferDto(transfer!) }, 201);
});

financeRoutes.get(walletCollection, requireAuth, scopeOwner, async (c) => {
  const result = await new FinanceRepository(c.env.DB).listWallets(c.get('ownerUserId'));
  return c.json({ wallets: result.results.map(walletDto) });
});

financeRoutes.post(walletCollection, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const input = parseWalletInput(await jsonBody(c.req.raw));
  const wallet = await new FinanceRepository(c.env.DB).createWallet(c.get('ownerUserId'), input);
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'wallet', wallet!.id, 'CREATE', walletDto(wallet!));
  return c.json({ wallet: walletDto(wallet!) }, 201);
});

financeRoutes.get(walletItem, requireAuth, scopeOwner, async (c) => {
  const wallet = await new FinanceRepository(c.env.DB).getWallet(c.get('ownerUserId'), c.req.param('walletId'));
  if (!wallet) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy ví.');
  return c.json({ wallet: walletDto(wallet) });
});

financeRoutes.put(walletItem, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const input = parseWalletInput(await jsonBody(c.req.raw));
  const wallet = await new FinanceRepository(c.env.DB).updateWallet(c.get('ownerUserId'), c.req.param('walletId'), input);
  if (!wallet) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy ví.');
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'wallet', wallet.id, 'UPDATE', walletDto(wallet));
  return c.json({ wallet: walletDto(wallet) });
});

financeRoutes.delete(walletItem, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const ownerUserId = c.get('ownerUserId');
  const walletId = c.req.param('walletId');
  const before = await new FinanceRepository(c.env.DB).getWallet(ownerUserId, walletId);
  const result = await new FinanceRepository(c.env.DB).deleteWallet(ownerUserId, walletId);
  if (result === 'NOT_FOUND') throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy ví.');
  if (result === 'IN_USE') throw new AuthError(409, 'WALLET_IN_USE', 'Không thể xóa ví đang được giao dịch sử dụng.');
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, ownerUserId, 'wallet', walletId, 'DELETE', before ? walletDto(before) : undefined);
  return c.body(null, 204);
});

financeRoutes.get(categoryCollection, requireAuth, scopeOwner, async (c) => {
  const result = await new FinanceRepository(c.env.DB).listCategories(c.get('ownerUserId'));
  return c.json({ categories: result.results.map(categoryDto) });
});

financeRoutes.post(categoryCollection, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const input = parseCategoryInput(await jsonBody(c.req.raw));
  const category = await new FinanceRepository(c.env.DB).createCategory(c.get('ownerUserId'), input);
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'category', category!.id, 'CREATE', categoryDto(category!));
  return c.json({ category: categoryDto(category!) }, 201);
});

financeRoutes.get(categoryItem, requireAuth, scopeOwner, async (c) => {
  const category = await new FinanceRepository(c.env.DB).getCategory(c.get('ownerUserId'), c.req.param('categoryId'));
  if (!category) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy danh mục.');
  return c.json({ category: categoryDto(category) });
});

financeRoutes.put(categoryItem, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const input = parseCategoryInput(await jsonBody(c.req.raw));
  const category = await new FinanceRepository(c.env.DB).updateCategory(c.get('ownerUserId'), c.req.param('categoryId'), input);
  if (!category) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy danh mục.');
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'category', category.id, 'UPDATE', categoryDto(category));
  return c.json({ category: categoryDto(category) });
});

financeRoutes.delete(categoryItem, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const ownerUserId = c.get('ownerUserId');
  const categoryId = c.req.param('categoryId');
  const repository = new FinanceRepository(c.env.DB);
  const before = await repository.getCategory(ownerUserId, categoryId);
  const result = await repository.deleteCategory(ownerUserId, categoryId);
  if (result === 'NOT_FOUND') throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy danh mục.');
  if (result === 'DEFAULT') throw new AuthError(409, 'DEFAULT_CATEGORY', 'Không thể xóa danh mục mặc định.');
  if (result === 'IN_USE') throw new AuthError(409, 'CATEGORY_IN_USE', 'Không thể xóa danh mục đang được giao dịch sử dụng.');
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, ownerUserId, 'category', categoryId, 'DELETE', before ? categoryDto(before) : undefined);
  return c.body(null, 204);
});

financeRoutes.get(transactionCollection, requireAuth, scopeOwner, async (c) => {
  const includeDeletedQuery = c.req.query('includeDeleted');
  const updatedAfterQuery = c.req.query('updatedAfter');
  if (includeDeletedQuery !== undefined && !['true', '1', 'false', '0'].includes(includeDeletedQuery)) {
    throw new AuthError(400, 'INVALID_INPUT', 'Tham số truy vấn giao dịch không hợp lệ.');
  }
  const updatedAfter = updatedAfterQuery === undefined ? undefined : Number(updatedAfterQuery);
  if (updatedAfterQuery !== undefined && (!Number.isSafeInteger(updatedAfter) || updatedAfter! < 0)) {
    throw new AuthError(400, 'INVALID_INPUT', 'Mốc cập nhật giao dịch không hợp lệ.');
  }
  const result = await new TransactionsRepository(c.env.DB).list(c.get('ownerUserId'), {
    includeDeleted: includeDeletedQuery === 'true' || includeDeletedQuery === '1',
    updatedAfter
  });
  return c.json({ transactions: result.results.map(transactionDto) });
});

financeRoutes.get(`${transactionCollection}/search`, requireAuth, scopeOwner, async (c) => {
  const options = parseTransactionSearchOptions(c.req.query());
  const result = await new FinanceReportingRepository(c.env.DB).searchTransactions(c.get('ownerUserId'), options);
  return c.json({ ...result, transactions: result.transactions.map(transactionDto) });
});

financeRoutes.post(transactionCollection, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const input = parseTransactionInput(await jsonBody(c.req.raw));
  if (input.revision !== undefined) throw new AuthError(400, 'INVALID_INPUT', 'Không gửi revision khi tạo giao dịch.');
  const transaction = await new TransactionsRepository(c.env.DB).create(c.get('ownerUserId'), input);
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'transaction', transaction!.id, 'CREATE', transactionDto(transaction!));
  return c.json({ transaction: transactionDto(transaction!) }, 201);
});

financeRoutes.get(transactionItem, requireAuth, scopeOwner, async (c) => {
  const transaction = await new TransactionsRepository(c.env.DB).get(c.get('ownerUserId'), c.req.param('transactionId'));
  if (!transaction) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch.');
  return c.json({ transaction: transactionDto(transaction) });
});

financeRoutes.put(transactionItem, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const input = parseTransactionInput(await jsonBody(c.req.raw));
  if (input.id !== undefined && input.id !== c.req.param('transactionId')) throw new AuthError(400, 'INVALID_INPUT', 'Không thể đổi mã giao dịch.');
  const transaction = await new TransactionsRepository(c.env.DB).update(c.get('ownerUserId'), c.req.param('transactionId'), input);
  if (!transaction) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch đang hoạt động.');
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'transaction', transaction.id, 'UPDATE', transactionDto(transaction));
  return c.json({ transaction: transactionDto(transaction) });
});

financeRoutes.delete(transactionItem, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const transaction = await new TransactionsRepository(c.env.DB).delete(c.get('ownerUserId'), c.req.param('transactionId'));
  if (!transaction) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch.');
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'transaction', transaction.id, 'DELETE', transactionDto(transaction));
  return c.json({ transaction: transactionDto(transaction) });
});

financeRoutes.post(`${transactionItem}/undo`, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const result = await new TransactionsRepository(c.env.DB).undo(c.get('ownerUserId'), c.req.param('transactionId'));
  if (!result) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch.');
  if (result === 'EXPIRED') throw new AuthError(409, 'UNDO_WINDOW_EXPIRED', 'Đã quá 10 giây nên không thể hoàn tác xóa giao dịch.');
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, c.get('ownerUserId'), 'transaction', result.id, 'RESTORE', transactionDto(result));
  return c.json({ transaction: transactionDto(result) });
});
