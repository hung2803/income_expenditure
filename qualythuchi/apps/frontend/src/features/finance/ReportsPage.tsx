import { usePageLoader } from '@/hooks/use-page-loader';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, CalendarDays, CircleHelp, LineChart, PieChart, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { adminApi } from '../../infrastructure/api/admin';
import { financeApi, type ApiCategory, type ApiWallet, type FinanceReport, type TransactionSearchQuery } from '../../infrastructure/api/finance';
import { formatVnd } from './finance-data';
import './reports.css';

type Preset = 'month' | 'previous' | 'quarter' | 'year' | 'custom';
type Bucket = 'day' | 'week' | 'month';
type ChartMode = 'bar' | 'line';
interface DateRange { from: string; to: string }
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function presetRange(preset: Exclude<Preset, 'custom'>, now = new Date()): DateRange {
  const year = now.getFullYear(); const month = now.getMonth();
  if (preset === 'month') return { from: `${monthKey(now)}-01`, to: localDateKey(now) };
  if (preset === 'previous') {
    const previous = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    return { from: `${monthKey(previous)}-01`, to: localDateKey(last) };
  }
  if (preset === 'quarter') {
    const firstMonth = Math.floor(month / 3) * 3;
    return { from: `${year}-${String(firstMonth + 1).padStart(2, '0')}-01`, to: localDateKey(now) };
  }
  return { from: `${year}-01-01`, to: localDateKey(now) };
}
function rangeTitle(range: DateRange) {
  const from = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${range.from}T12:00:00Z`));
  const to = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${range.to}T12:00:00Z`));
  return `${from} – ${to}`;
}
function seriesLabel(key: string, bucket: Bucket) {
  const date = new Date(`${key.slice(0, 10)}T12:00:00Z`);
  if (bucket === 'month') return new Intl.DateTimeFormat('vi-VN', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
}
function reportsSearchLink(range: DateRange, filters: Pick<TransactionSearchQuery, 'categoryId' | 'walletId' | 'type'> = {}) {
  const params = new URLSearchParams({ from: range.from, to: range.to, timezone: timezone() });
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.walletId) params.set('walletId', filters.walletId);
  if (filters.type) params.set('type', filters.type);
  return `/search?${params.toString()}`;
}

export function ReportsPage() {
  const { session } = useAuth();
  const isAdmin = session?.user.role === 'SUPER_ADMIN';
  const userId = session?.user.id ?? '';
  const [users, setUsers] = useState<Array<{ id: string; username: string; displayName: string; role: 'USER' | 'SUPER_ADMIN' }>>([]);
  const [ownerId, setOwnerId] = useState(isAdmin ? '' : userId);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [wallets, setWallets] = useState<ApiWallet[]>([]);
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const [preset, setPreset] = useState<Preset>('month');
  const [bucket, setBucket] = useState<Bucket>('day');
  const [mode, setMode] = useState<ChartMode>('bar');
  const [categoryId, setCategoryId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) { setOwnerId(userId); return; }
    let active = true;
    void adminApi.listUsers().then((items) => {
      if (!active) return;
      const usersOnly = items.filter((item) => item.role === 'USER');
      setUsers(usersOnly);
      setOwnerId((current) => usersOnly.some((item) => item.id === current) ? current : usersOnly[0]?.id ?? '');
    }).catch(() => setError('Không tải được danh sách tài khoản.'));
    return () => { active = false; };
  }, [isAdmin, userId]);

  usePageLoader(async (controller, refreshing) => {
    if (!ownerId) return;
    await Promise.all([financeApi.listCategories(ownerId, controller.signal), financeApi.listWallets(ownerId, controller.signal)])
      .then(([nextCategories, nextWallets]) => { if (controller.signal.aborted) return; setCategories(nextCategories); setWallets(nextWallets); })
      .catch((error: unknown) => { if (controller.signal.aborted) return; if (refreshing) throw error; if (!controller.signal.aborted) setError('Không tải được danh mục và ví.'); });
  }, `options:${ownerId}`);

  usePageLoader(async (controller, refreshing) => {
    if (!ownerId) return;
    if (!refreshing) { setBusy(true); setError(''); }
    await financeApi.getReport(ownerId, { ...range, timezone: timezone(), bucket, categoryId: categoryId || undefined, walletId: walletId || undefined }, controller.signal)
      .then((value) => { if (!controller.signal.aborted) { setReport(value); setError(''); } }).catch((error: unknown) => { if (controller.signal.aborted) return; if (refreshing) throw error; if (!controller.signal.aborted) setError('Không tải được báo cáo. Hãy kiểm tra khoảng ngày và thử lại.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
  }, JSON.stringify([ownerId, range, bucket, categoryId, walletId]));

  const expenseCategories = useMemo(() => report?.categories.filter((item) => item.type === 'EXPENSE').sort((a, b) => b.amount - a.amount) ?? [], [report]);
  const incomeCategories = useMemo(() => report?.categories.filter((item) => item.type === 'INCOME').sort((a, b) => b.amount - a.amount) ?? [], [report]);
  const selectedUser = users.find((item) => item.id === ownerId);

  if (!session) return null;

  function choosePreset(next: Exclude<Preset, 'custom'>) {
    setPreset(next); setRange(presetRange(next));
    setBucket(next === 'quarter' ? 'week' : next === 'year' ? 'month' : 'day');
  }
  function updateRange(key: keyof DateRange, value: string) {
    setRange((current) => ({ ...current, [key]: value })); setPreset('custom');
  }

  return <div className="reports-page">
    <header className="reports-heading">
      
      <div><h1>Báo cáo thống kê</h1><p>Tổng quan thu chi và tình hình tài chính</p></div>
      <Link className="reports-search-shortcut" to={reportsSearchLink(range)} aria-label="Tìm kiếm giao dịch"><Search /><span>Tìm kiếm</span></Link>
    </header>
    {isAdmin && <label className="reports-owner"><span>Tài khoản đang xem</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">Chọn User</option>{users.map((item) => <option key={item.id} value={item.id}>{item.displayName} · @{item.username}</option>)}</select></label>}
    {selectedUser && isAdmin && <p className="reports-selected-user">Đang xem dữ liệu của <strong>{selectedUser.displayName}</strong></p>}
    <section className="reports-period-card">
      <div className="reports-presets" role="tablist" aria-label="Khoảng thời gian">
        {([['month', 'Tháng này'], ['previous', 'Tháng trước'], ['quarter', 'Quý này'], ['year', 'Năm nay'], ['custom', 'Tùy chọn']] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={preset === value} className={preset === value ? 'reports-preset reports-preset-active' : 'reports-preset'} onClick={() => value === 'custom' ? setPreset('custom') : choosePreset(value)} key={value}>{label}</button>)}
      </div>
      <div className="reports-period-controls"><CalendarDays aria-hidden="true" /><div><strong>{preset === 'month' ? `Tháng ${Number(range.from.slice(5, 7))}, ${range.from.slice(0, 4)}` : 'Khoảng thời gian'}</strong><span>{rangeTitle(range)}</span></div>
        <div className="reports-date-inputs"><label><span>Từ</span><input type="date" value={range.from} onChange={(event) => updateRange('from', event.target.value)} /></label><label><span>Đến</span><input type="date" value={range.to} onChange={(event) => updateRange('to', event.target.value)} /></label></div>
      </div>
      <div className="reports-filter-row"><label><span>Danh mục</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Tất cả danh mục</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.type === 'INCOME' ? 'Thu · ' : 'Chi · '}{item.name}</option>)}</select></label><label><span>Ví</span><select value={walletId} onChange={(event) => setWalletId(event.target.value)}><option value="">Tất cả ví</option>{wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    </section>
    {error && <p className="reports-error" role="alert">{error}</p>}
    <section className="reports-totals" aria-label="Tổng thu chi trong kỳ">
      <article><span className="reports-total-icon reports-income-icon"><ArrowDown aria-hidden="true" /></span><div><small>Tổng thu</small><strong>{report ? formatVnd(report.totals.income) : '—'}</strong></div></article>
      <article><span className="reports-total-icon reports-expense-icon"><ArrowUp aria-hidden="true" /></span><div><small>Tổng chi</small><strong>{report ? formatVnd(report.totals.expense) : '—'}</strong></div></article>
      <article><span className="reports-total-icon reports-net-icon"><PieChart aria-hidden="true" /></span><div><small>Chênh lệch</small><strong>{report ? formatVnd(report.totals.net) : '—'}</strong></div></article>
    </section>
    <section className="reports-card reports-series-card">
      <header className="reports-card-heading"><div><h2>Biểu đồ thu chi</h2><p>{rangeTitle(range)} · {report?.totals.count ?? 0} giao dịch</p></div><div className="reports-chart-controls"><label><span className="sr-only">Tổng hợp theo</span><select value={bucket} onChange={(event) => setBucket(event.target.value as Bucket)}><option value="day">Ngày</option><option value="week">Tuần</option><option value="month">Tháng</option></select></label><div role="group" aria-label="Kiểu biểu đồ"><button type="button" aria-label="Biểu đồ cột" aria-pressed={mode === 'bar'} onClick={() => setMode('bar')}><BarChart3 /></button><button type="button" aria-label="Biểu đồ đường" aria-pressed={mode === 'line'} onClick={() => setMode('line')}><LineChart /></button></div></div></header>
      <SeriesChart report={report} mode={mode} bucket={bucket} />
      <div className="reports-legend"><span><i className="legend-income" />Thu</span><span><i className="legend-expense" />Chi</span>{busy && <span className="reports-loading">Đang cập nhật…</span>}</div>
    </section>
    <div className="reports-breakdowns">
      <CategoryBreakdown title="Cơ cấu chi tiêu" type="EXPENSE" rows={expenseCategories} total={report?.totals.expense ?? 0} range={range} />
      <CategoryBreakdown title="Cơ cấu thu nhập" type="INCOME" rows={incomeCategories} total={report?.totals.income ?? 0} range={range} />
    </div>
    <section className="reports-card reports-top-spending">
      <header className="reports-card-heading"><div><h2>Chi tiêu theo danh mục</h2><p>Nhấn vào danh mục để xem các giao dịch</p></div><Link to={reportsSearchLink(range, { type: 'EXPENSE' })}>Tất cả <ArrowRight /></Link></header>
      {!expenseCategories.length ? <div className="reports-empty"><CircleHelp /><span>Chưa có khoản chi trong kỳ này.</span></div> : expenseCategories.slice(0, 6).map((item, index) => {
        const share = report?.totals.expense ? item.amount / report.totals.expense * 100 : 0;
        return <Link className="reports-category-row" to={reportsSearchLink(range, { categoryId: item.categoryId, type: 'EXPENSE' })} key={item.categoryId}>
          <span className={`reports-category-dot category-color-${index % 6}`} />
          <span className="reports-category-name">{item.name}</span>
          <span className="reports-category-progress"><i className={`category-color-fill-${index % 6}`} style={{ width: `${share}%` }} /></span>
          <strong>{formatVnd(item.amount)}</strong><small>{share.toFixed(share % 1 ? 1 : 0)}%</small>
        </Link>;
      })}
    </section>
    <p className="reports-footnote">Số liệu được tổng hợp theo ngày tại múi giờ {timezone()}.</p>
  </div>;
}

function SeriesChart({ report, mode, bucket }: { report: FinanceReport | null; mode: ChartMode; bucket: Bucket }) {
  const data = report?.series ?? [];
  const width = 720; const height = 230; const left = 38; const right = 10; const top = 12; const bottom = 37;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.income, item.expense]));
  const labelStep = Math.max(1, Math.ceil(data.length / 7));
  const y = (value: number) => top + plotHeight - value / maxValue * plotHeight;
  const x = (index: number) => left + (data.length < 2 ? plotWidth / 2 : index / (data.length - 1) * plotWidth);
  const points = (field: 'income' | 'expense') => data.map((item, index) => `${x(index)},${y(item[field])}`).join(' ');
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maxValue * ratio);
  const axisAmount = (value: number) => value === 0 ? '0' : value < 1_000_000 ? `${Math.round(value / 1_000)}k` : `${(value / 1_000_000).toFixed(1)}tr`;
  if (!data.length) return <div className="reports-chart-empty">{report ? 'Chưa có dữ liệu trong kỳ đã chọn.' : 'Đang tải báo cáo…'}</div>;
  return <div className="reports-chart-wrap"><svg className="reports-series-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Biểu đồ thu chi theo ${bucket === 'day' ? 'ngày' : bucket === 'week' ? 'tuần' : 'tháng'}`}>
    {gridValues.map((value, index) => <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="reports-grid-line" /><text x={left - 6} y={y(value) + 4} textAnchor="end" className="reports-axis-label">{axisAmount(value)}</text></g>)}
    {mode === 'bar' ? data.map((item, index) => {
      const stepWidth = plotWidth / Math.max(1, data.length);
      const barWidth = Math.max(2, Math.min(16, stepWidth * 0.32));
      const center = left + (index + 0.5) * stepWidth;
      return <g key={item.key}><title>{seriesLabel(item.key, bucket)}: thu {formatVnd(item.income)}, chi {formatVnd(item.expense)}</title>
        <rect x={center - barWidth - 1} y={y(item.income)} width={barWidth} height={Math.max(0, top + plotHeight - y(item.income))} rx="3" className="reports-bar-income" />
        <rect x={center + 1} y={y(item.expense)} width={barWidth} height={Math.max(0, top + plotHeight - y(item.expense))} rx="3" className="reports-bar-expense" />
      </g>;
    }) : <>
      <polyline points={points('income')} className="reports-line-income" />
      <polyline points={points('expense')} className="reports-line-expense" />
      {data.map((item, index) => <g key={item.key}><title>{seriesLabel(item.key, bucket)}: thu {formatVnd(item.income)}, chi {formatVnd(item.expense)}</title><circle cx={x(index)} cy={y(item.income)} r="3" className="reports-point-income" /><circle cx={x(index)} cy={y(item.expense)} r="3" className="reports-point-expense" /></g>)}
    </>}
    {data.map((item, index) => index % labelStep === 0 || index === data.length - 1 ? <text key={item.key} x={left + (index + 0.5) * plotWidth / Math.max(1, data.length)} y={height - 10} textAnchor="middle" className="reports-axis-label">{seriesLabel(item.key, bucket)}</text> : null)}
  </svg></div>;
}

const categoryColors = ['#ff9d32', '#ef5667', '#3b8cff', '#8b65e8', '#25bd87', '#a8b5c7'];
function CategoryBreakdown({ title, type, rows, total, range }: { title: string; type: 'INCOME' | 'EXPENSE'; rows: FinanceReport['categories']; total: number; range: DateRange }) {
  const values = rows.filter((item) => item.type === type).slice(0, 7);
  let offset = 0;
  const gradient = values.map((item, index) => {
    const start = offset; offset += total ? item.amount / total * 100 : 0;
    return `${categoryColors[index % categoryColors.length]} ${start}% ${offset}%`;
  }).join(', ');
  const colors = new Map(values.map((item, index) => [item.categoryId, categoryColors[index % categoryColors.length]]));
  return <section className="reports-card reports-breakdown-card">
    <header className="reports-card-heading"><h2>{title}</h2><Link to={reportsSearchLink(range, { type })}>Chi tiết <ArrowRight /></Link></header>
    {!values.length ? <div className="reports-empty"><PieChart /><span>Chưa có dữ liệu.</span></div> : <div className="reports-donut-layout">
      <div className="reports-donut" style={{ background: `conic-gradient(${gradient || '#e9eff6 0% 100%'})` }} role="img" aria-label={`${title}, tổng ${formatVnd(total)}`}><span><strong>{formatVnd(total)}</strong><small>Tổng {type === 'INCOME' ? 'thu' : 'chi'}</small></span></div>
      <div className="reports-breakdown-list">{values.map((item) => <Link to={reportsSearchLink(range, { categoryId: item.categoryId, type })} key={item.categoryId}><i style={{ background: colors.get(item.categoryId) }} /><span>{item.name}</span><strong>{total ? `${(item.amount / total * 100).toFixed(1)}%` : '0%'}</strong></Link>)}</div>
    </div>}
  </section>;
}
