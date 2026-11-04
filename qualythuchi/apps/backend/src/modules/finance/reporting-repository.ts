import { AuthError } from '../auth/errors.ts';
import type { TransactionRow } from './transactions-repository.ts';

export type ReportBucket = 'day' | 'week' | 'month';
export type TransactionSort = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc';

export interface TransactionSearchOptions {
  from?: string;
  to?: string;
  timezone: string;
  categoryId?: string;
  walletId?: string;
  type?: 'INCOME' | 'EXPENSE';
  minAmount?: number;
  maxAmount?: number;
  tag?: string;
  keyword?: string;
  page: number;
  limit: number;
  sort: TransactionSort;
}

export interface ReportOptions {
  from: string;
  to: string;
  timezone: string;
  bucket: ReportBucket;
  categoryId?: string;
  walletId?: string;
}

interface Period { key: string; start: number; end: number }
interface SeriesRow { period: string; type: 'INCOME' | 'EXPENSE'; amount: number }
interface CategoryRow { category_id: string; category_name: string; type: 'INCOME' | 'EXPENSE'; amount: number }
interface WalletRow { wallet_id: string; wallet_name: string; amount: number }

function invalid(message = 'Bộ lọc báo cáo không hợp lệ.') {
  return new AuthError(400, 'INVALID_INPUT', message);
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw invalid('Ngày cần theo định dạng YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalid('Ngày không hợp lệ.');
  return date;
}

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

export function localDayBoundary(value: string, timezone: string): number {
  const day = parseDate(value);
  const target = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  let candidate = target;
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const difference = target - represented;
    if (!difference) break;
    candidate += difference;
  }
  return candidate;
}

function validateTimezone(timezone: string) {
  if (!timezone || timezone.length > 64) throw invalid('Múi giờ không hợp lệ.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
  catch { throw invalid('Múi giờ không hợp lệ.'); }
}

function validateRange(from?: string, to?: string) {
  if (from) parseDate(from);
  if (to) parseDate(to);
  if (from && to) {
    const dayCount = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
    if (dayCount < 1 || dayCount > 1_830) throw invalid('Khoảng thời gian cần nằm trong vòng 5 năm.');
  }
}

interface FilterParts { where: string[]; values: Array<string | number> }
function transactionFilters(ownerUserId: string, options: Partial<TransactionSearchOptions>, from?: number, until?: number): FilterParts {
  const where = ['t.owner_user_id = ?', 't.deleted_at IS NULL'];
  const values: Array<string | number> = [ownerUserId];
  if (from !== undefined) { where.push('t.occurred_at >= ?'); values.push(from); }
  if (until !== undefined) { where.push('t.occurred_at < ?'); values.push(until); }
  if (options.categoryId) { where.push('t.category_id = ?'); values.push(options.categoryId); }
  if (options.walletId) { where.push('t.wallet_id = ?'); values.push(options.walletId); }
  if (options.type) { where.push('t.type = ?'); values.push(options.type); }
  if (options.minAmount !== undefined) { where.push('t.amount >= ?'); values.push(options.minAmount); }
  if (options.maxAmount !== undefined) { where.push('t.amount <= ?'); values.push(options.maxAmount); }
  if (options.tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(t.tags_json) tag WHERE LOWER(tag.value) = LOWER(?))");
    values.push(options.tag);
  }
  if (options.keyword) {
    const escaped = options.keyword.toLocaleLowerCase('vi').replace(/[\\%_]/gu, (match) => `\\${match}`);
    const pattern = `%${escaped}%`;
    where.push(`(LOWER(t.note) LIKE ? ESCAPE '\\' OR LOWER(c.name) LIKE ? ESCAPE '\\' OR LOWER(w.name) LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM json_each(t.tags_json) tag WHERE LOWER(tag.value) LIKE ? ESCAPE '\\'))`);
    values.push(pattern, pattern, pattern, pattern);
  }
  return { where, values };
}

export function parseTransactionSearchOptions(query: Record<string, string | undefined>): TransactionSearchOptions {
  const timezone = query.timezone ?? 'UTC';
  validateTimezone(timezone);
  validateRange(query.from, query.to);
  if (query.from && query.to && query.from > query.to) throw invalid('Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.');
  if (query.type && query.type !== 'INCOME' && query.type !== 'EXPENSE') throw invalid();
  const parseAmount = (value: string | undefined) => {
    if (value === undefined || value === '') return undefined;
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) throw invalid('Khoảng tiền cần là số nguyên VND không âm.');
    return amount;
  };
  const minAmount = parseAmount(query.minAmount);
  const maxAmount = parseAmount(query.maxAmount);
  if (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) throw invalid('Mức tiền từ không được lớn hơn mức tiền đến.');
  for (const name of ['categoryId', 'walletId'] as const) {
    if (query[name] !== undefined && (!query[name] || query[name]!.length > 128)) throw invalid();
  }
  if (query.tag !== undefined && (!query.tag.trim() || query.tag.length > 32)) throw invalid('Nhãn cần từ 1 đến 32 ký tự.');
  if (query.keyword !== undefined && query.keyword.length > 100) throw invalid('Từ khóa tối đa 100 ký tự.');
  const page = Number(query.page ?? '1');
  const limit = Number(query.limit ?? '25');
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw invalid('Trang hoặc số dòng mỗi trang không hợp lệ.');
  const sort = query.sort ?? 'newest';
  if (!['newest', 'oldest', 'amount-desc', 'amount-asc'].includes(sort)) throw invalid('Thứ tự sắp xếp không hợp lệ.');
  return {
    timezone, page, limit, sort: sort as TransactionSort,
    ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.walletId ? { walletId: query.walletId } : {}),
    ...(query.type ? { type: query.type as 'INCOME' | 'EXPENSE' } : {}), ...(minAmount === undefined ? {} : { minAmount }),
    ...(maxAmount === undefined ? {} : { maxAmount }), ...(query.tag?.trim() ? { tag: query.tag.trim() } : {}),
    ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {})
  };
}

export function parseReportOptions(query: Record<string, string | undefined>): ReportOptions {
  const from = query.from ?? '';
  const to = query.to ?? '';
  if (!from || !to) throw invalid('Cần chọn ngày bắt đầu và ngày kết thúc.');
  validateRange(from, to);
  if (from > to) throw invalid('Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.');
  const timezone = query.timezone ?? 'UTC';
  validateTimezone(timezone);
  const bucket = query.bucket ?? 'day';
  if (bucket !== 'day' && bucket !== 'week' && bucket !== 'month') throw invalid('Kiểu tổng hợp không hợp lệ.');
  if (bucket === 'day' && Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 370 * 86_400_000) {
    throw invalid('Biểu đồ theo ngày chỉ hỗ trợ tối đa 371 ngày.');
  }
  for (const name of ['categoryId', 'walletId'] as const) {
    if (query[name] !== undefined && (!query[name] || query[name]!.length > 128)) throw invalid();
  }
  return { from, to, timezone, bucket, ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.walletId ? { walletId: query.walletId } : {}) };
}

function makePeriods(options: ReportOptions): Period[] {
  const periods: Period[] = [];
  if (options.bucket === 'day') {
    for (let day = options.from; day <= options.to; day = addDays(day, 1)) {
      periods.push({ key: day, start: localDayBoundary(day, options.timezone), end: localDayBoundary(addDays(day, 1), options.timezone) });
    }
    return periods;
  }
  if (options.bucket === 'week') {
    const start = parseDate(options.from);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const last = parseDate(options.to);
    for (let day = dateKey(start); day <= dateKey(last); day = addDays(day, 7)) {
      const next = addDays(day, 7);
      periods.push({ key: day, start: localDayBoundary(day, options.timezone), end: localDayBoundary(next, options.timezone) });
    }
    return periods;
  }
  const first = `${options.from.slice(0, 7)}-01`;
  const lastMonth = `${options.to.slice(0, 7)}-01`;
  for (let month = first; month <= lastMonth;) {
    const next = addMonths(month, 1);
    periods.push({ key: month.slice(0, 7), start: localDayBoundary(month, options.timezone), end: localDayBoundary(next, options.timezone) });
    month = next;
  }
  return periods;
}

function addMonths(value: string, count: number) {
  const date = parseDate(value);
  date.setUTCMonth(date.getUTCMonth() + count);
  return dateKey(date);
}

export class FinanceReportingRepository {
  private db: D1DatabaseSession;
  constructor(database: D1Database) { this.db = database.withSession('first-primary'); }

  async searchTransactions(ownerUserId: string, options: TransactionSearchOptions) {
    validateRange(options.from, options.to);
    validateTimezone(options.timezone);
    const from = options.from ? localDayBoundary(options.from, options.timezone) : undefined;
    const until = options.to ? localDayBoundary(addDays(options.to, 1), options.timezone) : undefined;
    const { where, values } = transactionFilters(ownerUserId, options, from, until);
    const base = `FROM transactions t JOIN wallets w ON w.owner_user_id=t.owner_user_id AND w.id=t.wallet_id
      JOIN categories c ON c.owner_user_id=t.owner_user_id AND c.id=t.category_id WHERE ${where.join(' AND ')}`;
    const [rows, total] = await Promise.all([
      this.db.prepare(`SELECT t.id,t.owner_user_id,t.wallet_id,t.category_id,t.type,t.amount,t.occurred_at,t.note,t.tags_json,
        t.created_at,t.updated_at,t.deleted_at,t.revision,w.name AS wallet_name,c.name AS category_name ${base}
        ORDER BY ${sortSql[options.sort]} LIMIT ? OFFSET ?`)
        .bind(...values, options.limit, (options.page - 1) * options.limit).all<TransactionRow>(),
      this.db.prepare(`SELECT COUNT(*) AS total ${base}`).bind(...values).first<{ total: number }>()
    ]);
    return { transactions: rows.results, total: total?.total ?? 0, page: options.page, limit: options.limit };
  }

  async getReport(ownerUserId: string, options: ReportOptions) {
    const from = localDayBoundary(options.from, options.timezone);
    const until = localDayBoundary(addDays(options.to, 1), options.timezone);
    const filters = transactionFilters(ownerUserId, options, from, until);
    const where = filters.where.join(' AND ');
    const periods = makePeriods(options);
    const caseSql = periods.map((period) => `WHEN t.occurred_at >= ${period.start} AND t.occurred_at < ${period.end} THEN '${period.key}'`).join(' ');
    const [totals, categoryResult, walletResult, seriesResult] = await Promise.all([
      this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN t.type='INCOME' THEN t.amount ELSE 0 END),0) AS income,
          COALESCE(SUM(CASE WHEN t.type='EXPENSE' THEN t.amount ELSE 0 END),0) AS expense,COUNT(*) AS count
        FROM transactions t WHERE ${where}`).bind(...filters.values).first<{ income: number; expense: number; count: number }>(),
      this.db.prepare(`SELECT t.category_id,c.name AS category_name,t.type,SUM(t.amount) AS amount ${
        `FROM transactions t JOIN categories c ON c.owner_user_id=t.owner_user_id AND c.id=t.category_id WHERE ${where}`
      } GROUP BY t.category_id,c.name,t.type ORDER BY amount DESC,t.category_id`).bind(...filters.values).all<CategoryRow>(),
      this.db.prepare(`SELECT t.wallet_id,w.name AS wallet_name,SUM(t.amount) AS amount FROM transactions t
        JOIN wallets w ON w.owner_user_id=t.owner_user_id AND w.id=t.wallet_id WHERE ${where} GROUP BY t.wallet_id,w.name ORDER BY amount DESC,t.wallet_id`)
        .bind(...filters.values).all<WalletRow>(),
      this.db.prepare(`SELECT period,type,SUM(amount) AS amount FROM (
        SELECT CASE ${caseSql} ELSE NULL END AS period,t.type,t.amount FROM transactions t WHERE ${where}
      ) WHERE period IS NOT NULL GROUP BY period,type`).bind(...filters.values).all<SeriesRow>()
    ]);
    const seriesMap = new Map(seriesResult.results.map((row) => [`${row.period}:${row.type}`, row.amount]));
    const series = periods.map((period) => ({ key: period.key,
      income: seriesMap.get(`${period.key}:INCOME`) ?? 0,
      expense: seriesMap.get(`${period.key}:EXPENSE`) ?? 0
    }));
    return {
      from: options.from, to: options.to, timezone: options.timezone, bucket: options.bucket,
      totals: { income: totals?.income ?? 0, expense: totals?.expense ?? 0, net: (totals?.income ?? 0) - (totals?.expense ?? 0), count: totals?.count ?? 0 },
      series,
      categories: categoryResult.results.map((row) => ({ categoryId: row.category_id, name: row.category_name, type: row.type, amount: row.amount })),
      wallets: walletResult.results.map((row) => ({ walletId: row.wallet_id, name: row.wallet_name, amount: row.amount }))
    };
  }
}

const sortSql: Record<TransactionSort, string> = {
  newest: 't.occurred_at DESC,t.id DESC',
  oldest: 't.occurred_at ASC,t.id ASC',
  'amount-desc': 't.amount DESC,t.occurred_at DESC,t.id DESC',
  'amount-asc': 't.amount ASC,t.occurred_at DESC,t.id DESC'
};
