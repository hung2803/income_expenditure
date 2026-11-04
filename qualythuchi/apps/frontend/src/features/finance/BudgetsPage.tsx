import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CirclePlus, Pencil, ReceiptText, Trash2, Wallet, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { FinanceToast } from './FinanceToast';
import { useFinanceToast } from './use-finance-toast';
import { formatVnd, parseVndInteger } from './finance-data';
import { formatVndInput } from './finance-rules';
import { VndInput } from './VndInput';
import { financeApi, type ApiBudget, type ApiCategory, type ApiTransaction } from '@/infrastructure/api/finance';
import { listLocalRecords, putLocalRecord } from '@/infrastructure/sync/sync-storage';
import { localMonthKey, summarizeBudgetMonth, type BudgetCategoryUsage } from './budgets-data';
import './finance.css';
import './budgets.css';

function shiftMonth(period: string, amount: number): string {
  const [year, month] = period.split('-').map(Number);
  const value = new Date(year!, month! - 1 + amount, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date(year!, month! - 1, 1));
}

function monthRangeLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(year!, month!, 0).getDate();
  return `01/${String(month).padStart(2, '0')} – ${lastDay}/${String(month).padStart(2, '0')}/${year}`;
}

export function BudgetsPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [period, setPeriod] = useState(localMonthKey());
  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<ApiBudget | null | undefined>(undefined);
  const { toast, showToast } = useFinanceToast();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    void Promise.all([
      financeApi.listBudgets(userId, controller.signal),
      financeApi.listCategories(userId, controller.signal),
      financeApi.listTransactions(userId, controller.signal)
    ]).then(([nextBudgets, nextCategories, nextTransactions]) => {
      setBudgets(nextBudgets); setCategories(nextCategories); setTransactions(nextTransactions);
      void Promise.all([
        ...nextBudgets.map((item) => putLocalRecord({ key: `budgets:${item.id}`, ownerUserId: userId, entity: 'budgets', id: item.id, value: item, updatedAt: item.updatedAt })),
        ...nextCategories.map((item) => putLocalRecord({ key: `categories:${item.id}`, ownerUserId: userId, entity: 'categories', id: item.id, value: item, updatedAt: Date.now() })),
        ...nextTransactions.map((item) => putLocalRecord({ key: `transactions:${item.id}`, ownerUserId: userId, entity: 'transactions', id: item.id, value: item, updatedAt: Date.now() }))
      ]).catch(() => undefined);
    }).catch(async () => {
      if (controller.signal.aborted) return;
      try {
        const [budgetRecords, categoryRecords, transactionRecords] = await Promise.all([
          listLocalRecords<ApiBudget>(userId, 'budgets'), listLocalRecords<ApiCategory>(userId, 'categories'), listLocalRecords<ApiTransaction>(userId, 'transactions')
        ]);
        setBudgets(budgetRecords.filter((item) => !item.deleted).map((item) => item.value));
        setCategories(categoryRecords.filter((item) => !item.deleted).map((item) => item.value));
        setTransactions(transactionRecords.filter((item) => !item.deleted && !item.value.deletedAt).map((item) => item.value));
      } catch { setError(true); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, period]);

  useEffect(() => {
    async function refreshSyncedData() {
      try {
        const [budgetRecords, transactionRecords] = await Promise.all([
          listLocalRecords<ApiBudget>(userId, 'budgets'), listLocalRecords<ApiTransaction>(userId, 'transactions')
        ]);
        setBudgets(budgetRecords.filter((item) => !item.deleted).map((item) => item.value));
        setTransactions(transactionRecords.filter((item) => !item.deleted && !item.value.deletedAt).map((item) => item.value));
      } catch { /* Keep the current view if local storage is busy in another tab. */ }
    }
    window.addEventListener('thu-chi-sync-change', refreshSyncedData);
    return () => window.removeEventListener('thu-chi-sync-change', refreshSyncedData);
  }, [userId]);

  const summary = useMemo(() => summarizeBudgetMonth(period, budgets, transactions), [period, budgets, transactions]);
  const periodBudgets = budgets.filter((budget) => budget.period === period);
  const totalBudget = periodBudgets.find((budget) => budget.categoryId === null);
  if (!session) return null;

  async function removeBudget(budget: ApiBudget) {
    const name = budget.categoryName ?? 'ngân sách tổng';
    if (!window.confirm(`Xóa ${name} tháng ${budget.period}?`)) return;
    try {
      await financeApi.deleteBudget(userId, budget.id, session!.csrfToken);
      setBudgets((current) => current.filter((item) => item.id !== budget.id));
      showToast('Đã xóa ngân sách.', 'success');
    } catch { showToast('Không xóa được ngân sách. Hãy tải lại rồi thử lại.'); }
  }

  function transactionHref(categoryId?: string | null) {
    const query = new URLSearchParams({ month: period, type: 'EXPENSE' });
    if (categoryId) query.set('categoryId', categoryId);
    return `/transactions?${query.toString()}`;
  }

  return <>
    <header className="budget-page-heading">
      <Link to="/dashboard" className="budget-back" aria-label="Quay lại trang chủ"><ChevronLeft /></Link>
      <div><h1>Ngân sách</h1><p>Lập kế hoạch chi tiêu theo tháng</p></div>
      <button className="budget-add-button" type="button" onClick={() => setEditing(null)}><CirclePlus />Tạo ngân sách</button>
    </header>
    <FinanceToast toast={toast} />
    <div className="budget-period-control"><button type="button" aria-label="Tháng trước" onClick={() => setPeriod((value) => shiftMonth(value, -1))}><ChevronLeft /></button><label><span className="sr-only">Chọn tháng</span><input type="month" value={period} onChange={(event) => { if (event.target.value) setPeriod(event.target.value); }} /></label><button type="button" aria-label="Tháng sau" onClick={() => setPeriod((value) => shiftMonth(value, 1))}><ChevronRight /></button></div>
    {loading ? <div className="account-empty budget-empty"><Wallet /><h2>Đang tải ngân sách…</h2></div> : error ? <div className="account-empty budget-empty"><Wallet /><h2>Không tải được ngân sách</h2><p>Kết nối mạng để tải dữ liệu hoặc thử lại sau.</p></div> : <>
      <section className="budget-overview-card" aria-label={`Tổng quan ngân sách ${monthLabel(period)}`}>
        <div className="budget-overview-heading"><span className="budget-icon"><Wallet /></span><div><small>{monthLabel(period)}</small><h2>{totalBudget ? 'Tổng ngân sách tháng' : 'Ngân sách đã lập'}</h2></div><span className="budget-period-range">{monthRangeLabel(period)}</span></div>
        <div className="budget-overview-numbers"><div><small>Tổng ngân sách</small><strong>{formatVnd(summary.budgetTotal)}</strong></div><div><small>Đã chi</small><strong className="budget-spent">{formatVnd(summary.spent)}</strong></div><div><small>{summary.remaining >= 0 ? 'Còn lại' : 'Vượt ngân sách'}</small><strong className={summary.remaining < 0 ? 'budget-over' : 'budget-remaining'}>{formatVnd(summary.remaining)}</strong></div></div>
        <div className="budget-progress-meta"><span>{summary.budgetTotal ? `${summary.percentUsed.toFixed(summary.percentUsed % 1 ? 1 : 0)}% đã sử dụng` : 'Chưa có ngân sách cho tháng này'}</span>{summary.budgetTotal > 0 && <span>{formatVnd(summary.spent)} / {formatVnd(summary.budgetTotal)}</span>}</div>
        <div className={`budget-progress-track ${summary.percentUsed >= 100 ? 'budget-progress-over' : ''}`} role="progressbar" aria-label="Tỷ lệ sử dụng ngân sách tháng" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, summary.percentUsed))}><i style={{ width: `${Math.min(100, Math.max(0, summary.percentUsed))}%` }} /></div>
        {totalBudget && <Link className="budget-related-link" to={transactionHref()}><ReceiptText />Xem các giao dịch tháng này</Link>}
      </section>

      <section className="account-section budget-category-section"><div className="account-section-title"><div><h2>Chi tiêu theo danh mục</h2><p>Tiến độ và số tiền còn lại từng khoản</p></div><button className="budget-add-inline" type="button" onClick={() => setEditing(null)}><CirclePlus />Thêm</button></div>
        {summary.categories.length === 0 ? <div className="account-empty budget-empty"><span className="account-empty-icon"><Wallet /></span><h2>Chưa có ngân sách cho tháng {period}</h2><p>Tạo ngân sách tổng hoặc đặt giới hạn cho một danh mục chi.</p><button type="button" className="account-primary-button" onClick={() => setEditing(null)}><CirclePlus />Tạo ngân sách</button></div> : <div className="budget-category-list">{summary.categories.map((usage) => <BudgetCategoryRow key={usage.budget.id} usage={usage} href={transactionHref(usage.budget.categoryId)} onEdit={() => setEditing(usage.budget)} onDelete={() => void removeBudget(usage.budget)} />)}</div>}
        {totalBudget && <article className="budget-total-row"><span className="budget-icon"><Wallet /></span><div className="budget-row-copy"><strong>Ngân sách tổng</strong><small>{formatVnd(totalBudget.amount)} · {period}</small></div><Link to={transactionHref()} aria-label="Xem giao dịch thuộc ngân sách tổng"><ReceiptText /></Link><button type="button" aria-label="Sửa ngân sách tổng" onClick={() => setEditing(totalBudget)}><Pencil /></button><button type="button" aria-label="Xóa ngân sách tổng" onClick={() => void removeBudget(totalBudget)}><Trash2 /></button></article>}
      </section>
    </>}
    {editing !== undefined && <BudgetDialog key={editing?.id ?? 'new'} item={editing} period={period} categories={categories} onClose={() => setEditing(undefined)} onSave={async (input) => {
      const saved = editing ? await financeApi.updateBudget(userId, editing.id, input, session.csrfToken) : await financeApi.createBudget(userId, input, session.csrfToken);
      setBudgets((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      showToast('Đã lưu ngân sách.', 'success'); setEditing(undefined);
    }} />}
  </>;
}

function BudgetCategoryRow({ usage, href, onEdit, onDelete }: { usage: BudgetCategoryUsage; href: string; onEdit: () => void; onDelete: () => void }) {
  const { budget } = usage;
  const percentage = usage.percentUsed;
  return <article className="budget-category-row">
    <span className="budget-icon"><Wallet /></span>
    <div className="budget-row-copy"><strong>{budget.categoryName ?? 'Danh mục'}</strong><small>Ngân sách {formatVnd(budget.amount)}</small><div className={`budget-progress-track budget-row-progress ${percentage >= 100 ? 'budget-progress-over' : ''}`} role="progressbar" aria-label={`${budget.categoryName ?? 'Danh mục'}: ${Math.round(percentage)}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, percentage))}><i style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} /></div></div>
    <div className="budget-row-amount"><strong>{formatVnd(usage.spent)} <span>/ {formatVnd(budget.amount)}</span></strong><small className={usage.remaining < 0 ? 'budget-over' : ''}>{usage.remaining < 0 ? `Vượt ${formatVnd(Math.abs(usage.remaining))}` : `Còn ${formatVnd(usage.remaining)}`} · {Math.round(percentage)}%</small></div>
    <Link to={href} className="budget-row-action" aria-label={`Xem giao dịch ${budget.categoryName ?? ''}`}><ReceiptText /></Link><button type="button" className="budget-row-action" aria-label={`Sửa ngân sách ${budget.categoryName ?? ''}`} onClick={onEdit}><Pencil /></button><button type="button" className="budget-row-action" aria-label={`Xóa ngân sách ${budget.categoryName ?? ''}`} onClick={onDelete}><Trash2 /></button>
  </article>;
}

function BudgetDialog({ item, period, categories, onClose, onSave }: { item: ApiBudget | null; period: string; categories: ApiCategory[]; onClose: () => void; onSave: (input: Pick<ApiBudget, 'categoryId' | 'period' | 'amount'>) => Promise<void> }) {
  const [month, setMonth] = useState(item?.period ?? period);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [amount, setAmount] = useState(item ? formatVndInput(String(item.amount)) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseVndInteger(amount);
    if (!month || parsed === undefined || parsed <= 0) { setError('Chọn tháng và nhập số tiền ngân sách lớn hơn 0.'); return; }
    setSaving(true); setError('');
    try { await onSave({ categoryId: categoryId || null, period: month, amount: parsed }); }
    catch { setError('Không lưu được. Ngân sách cho tháng và phạm vi này có thể đã tồn tại.'); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialog} className="account-dialog finance-dialog budget-dialog" onCancel={onClose} aria-labelledby="budget-dialog-title">
    <button className="account-dialog-close" type="button" aria-label="Đóng" onClick={onClose}><X /></button>
    <div className="finance-dialog-heading"><span className="account-empty-icon"><Wallet /></span><h2 id="budget-dialog-title">{item ? 'Sửa ngân sách' : 'Tạo ngân sách'}</h2><p>Đặt hạn mức cho cả tháng hoặc một danh mục chi.</p></div>
    <form className="finance-form" onSubmit={(event) => void submit(event)}>
      <label className="finance-field"><span>Tháng</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} required /></label>
      <label className="finance-field"><span>Phạm vi ngân sách</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Ngân sách tổng</option>{categories.filter((category) => category.type === 'EXPENSE').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="finance-field"><span>Số tiền (VND)</span><VndInput value={amount} onChange={setAmount} placeholder="0" /></label>
      {error && <p className="budget-form-error" role="alert">{error}</p>}
      <div className="finance-dialog-actions"><button type="button" className="account-secondary-button" onClick={onClose}>Hủy</button><button type="submit" className="account-primary-button" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu ngân sách'}</button></div>
    </form>
  </dialog>;
}
