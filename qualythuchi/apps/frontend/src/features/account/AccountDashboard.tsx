import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Eye, EyeOff, ReceiptText, Search, ShieldCheck, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { WalletIllustration } from '../auth/components/WalletIllustration';
import { formatVnd } from '../finance/finance-data';
import { financeApi } from '@/infrastructure/api/finance';
import type { ApiBudget, ApiCategory, ApiTransaction, ApiTransfer, ApiWallet, FinanceSummary } from '@/infrastructure/api/finance';
import { calculateMonthlyTotals, calculateWalletBalances } from '../finance/finance-ledger';
import { listLocalRecords } from '@/infrastructure/sync/sync-storage';
import { localMonthKey, summarizeBudgetMonth } from '../finance/budgets-data';

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function AccountDashboard() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [hidden, setHidden] = useState(false);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([financeApi.getSummary(userId, controller.signal), financeApi.listBudgets(userId, controller.signal), financeApi.listTransactions(userId, controller.signal), financeApi.listCategories(userId, controller.signal)]).then(([data, nextBudgets, nextTransactions, nextCategories]) => {
      setSummary(data);
      setBudgets(nextBudgets);
      setTransactions(nextTransactions);
      setCategories(nextCategories);
      setLoadError(false);
    }).catch(async () => {
      if (controller.signal.aborted) return;
      try {
        const [walletRecords, transactionRecords, transferRecords, budgetRecords, categoryRecords] = await Promise.all([
          listLocalRecords<ApiWallet>(userId, 'wallets'), listLocalRecords<ApiTransaction>(userId, 'transactions'), listLocalRecords<ApiTransfer>(userId, 'transfers'), listLocalRecords<ApiBudget>(userId, 'budgets'), listLocalRecords<ApiCategory>(userId, 'categories')
        ]);
        const wallets = walletRecords.map((record) => record.value);
        const transactions = transactionRecords.filter((record) => !record.deleted).map((record) => record.value);
        const transfers = transferRecords.filter((record) => !record.deleted).map((record) => record.value);
        const nextBudgets = budgetRecords.filter((record) => !record.deleted).map((record) => record.value);
        setBudgets(nextBudgets);
        setCategories(categoryRecords.filter((record) => !record.deleted).map((record) => record.value));
        setTransactions(transactions);
        const balances = calculateWalletBalances(wallets, transactions, transfers);
        const totals = calculateMonthlyTotals(transactions);
        const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));
        const recent = [
          ...transactions.map((item) => ({ id: item.id, type: item.type, amount: item.amount, occurredAt: item.occurredAt, note: item.note, walletName: walletById.get(item.walletId) ?? 'Ví', destinationWalletName: undefined })),
          ...transfers.map((item) => ({ id: item.id, type: 'TRANSFER' as const, amount: item.amount, occurredAt: item.occurredAt, note: '', walletName: walletById.get(item.sourceWalletId) ?? 'Ví', destinationWalletName: walletById.get(item.destinationWalletId) ?? 'Ví' }))
        ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 5);
        setSummary({ totalBalance: [...balances.values()].reduce((sum, balance) => sum + balance, 0), incomeThisMonth: totals.income, expenseThisMonth: totals.expense, recent });
        setLoadError(false);
      } catch { setLoadError(true); }
    });
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    async function refreshSyncedBudgets() {
      try {
        const [budgetRecords, transactionRecords, categoryRecords] = await Promise.all([
          listLocalRecords<ApiBudget>(userId, 'budgets'), listLocalRecords<ApiTransaction>(userId, 'transactions'), listLocalRecords<ApiCategory>(userId, 'categories')
        ]);
        setBudgets(budgetRecords.filter((record) => !record.deleted).map((record) => record.value));
        setTransactions(transactionRecords.filter((record) => !record.deleted && !record.value.deletedAt).map((record) => record.value));
        setCategories(categoryRecords.filter((record) => !record.deleted).map((record) => record.value));
      } catch { /* Keep the last loaded dashboard values if IndexedDB is temporarily unavailable. */ }
    }
    window.addEventListener('thu-chi-sync-change', refreshSyncedBudgets);
    return () => window.removeEventListener('thu-chi-sync-change', refreshSyncedBudgets);
  }, [userId]);

  const budgetSummary = useMemo(() => summarizeBudgetMonth(localMonthKey(), budgets, transactions), [budgets, transactions]);
  const spendingByCategory = useMemo(() => {
    const month = localMonthKey();
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
      const date = new Date(transaction.occurredAt);
      if (transaction.type !== 'EXPENSE' || transaction.deletedAt || localMonthKey(date) !== month) continue;
      totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + transaction.amount);
    }
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    return [...totals.entries()].map(([categoryId, amount]) => ({ categoryId, amount, name: categoryNames.get(categoryId) ?? 'Danh mục' })).sort((a, b) => b.amount - a.amount).slice(0, 4);
  }, [categories, transactions]);
  const spendingTotal = spendingByCategory.reduce((sum, item) => sum + item.amount, 0);
  if (!session) return null;
  const recentActivity = summary?.recent.map((activity) => ({
    ...activity,
    title: activity.type === 'TRANSFER' ? 'Chuyển tiền' : activity.note.trim() || (activity.type === 'INCOME' ? 'Khoản thu' : 'Khoản chi'),
    subtitle: activity.destinationWalletName ? `${activity.walletName} → ${activity.destinationWalletName}` : activity.walletName
  })) ?? [];
  return <>
    <div className="account-page-title"><h1>Xin chào, {session.user.displayName} <span aria-hidden="true">👋</span></h1><p>Theo dõi tài chính hôm nay</p></div>
    <section className="account-balance" aria-label="Tổng quan tài chính">
      <div className="account-balance-top"><div><div className="account-balance-label">Tổng số dư <button type="button" onClick={() => setHidden((value) => !value)} aria-label={hidden ? 'Hiện số dư' : 'Ẩn số dư'} aria-pressed={hidden}>{hidden ? <EyeOff /> : <Eye />}</button></div><p className="account-balance-value">{summary ? hidden ? '••••••' : formatVnd(summary.totalBalance) : '—'}</p></div><WalletIllustration /></div>
      <div className="account-month-summary"><div><span className="account-income-icon"><ArrowUp aria-hidden="true" /></span><p>Thu tháng này<strong>{summary ? hidden ? '••••' : formatVnd(summary.incomeThisMonth) : '—'}</strong></p></div><div><span className="account-expense-icon"><ArrowDown aria-hidden="true" /></span><p>Chi tháng này<strong>{summary ? hidden ? '••••' : formatVnd(summary.expenseThisMonth) : '—'}</strong></p></div></div>
    </section>
    <section className="dashboard-budget-cards" aria-label="Tổng quan ngân sách">
      <Link to="/budgets" className="dashboard-budget-card dashboard-budget-card-remaining"><span className="dashboard-budget-icon"><Wallet aria-hidden="true" /></span><span className="dashboard-budget-copy"><small>{budgetSummary.budgetTotal ? 'Ngân sách còn lại' : 'Ngân sách tháng này'}</small><strong>{budgetSummary.budgetTotal ? hidden ? '••••••' : formatVnd(budgetSummary.remaining) : 'Chưa thiết lập'}</strong><span className="dashboard-budget-progress"><i style={{ width: `${hidden ? 0 : Math.min(100, Math.max(0, budgetSummary.percentUsed))}%` }} /></span></span></Link>
      <Link to="/budgets" className="dashboard-budget-card dashboard-budget-card-used"><span className="dashboard-budget-icon"><ArrowUp aria-hidden="true" /></span><span className="dashboard-budget-copy"><small>Đã sử dụng</small><strong>{budgetSummary.budgetTotal ? hidden ? '•••' : `${Math.round(budgetSummary.percentUsed)}%` : 'Xem ngân sách'}</strong><span>{budgetSummary.budgetTotal ? hidden ? '••••••' : `${formatVnd(budgetSummary.spent)} / ${formatVnd(budgetSummary.budgetTotal)}` : 'Lập kế hoạch chi tiêu'}</span></span></Link>
    </section>
    <div className="dashboard-quick-actions"><Link to="/transfers"><ArrowLeftRight aria-hidden="true" />Chuyển tiền giữa các ví</Link><Link to="/transactions"><ReceiptText aria-hidden="true" />Giao dịch</Link><Link to="/search"><Search aria-hidden="true" />Tìm kiếm</Link></div>
    <section className="account-section dashboard-spending"><div className="account-section-title"><h2>Chi tiêu nhanh</h2><Link to="/reports">Xem báo cáo</Link></div>
      {!spendingByCategory.length ? <div className="dashboard-spending-empty">Chưa có khoản chi trong tháng này.</div> : <div className="dashboard-spending-list">{spendingByCategory.map((item, index) => <Link to={`/search?${new URLSearchParams({ from: `${localMonthKey()}-01`, to: localDateKey(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', type: 'EXPENSE', categoryId: item.categoryId })}`} key={item.categoryId}>
        <span className={`dashboard-spending-dot dashboard-spending-color-${index}`} /><span className="dashboard-spending-name">{item.name}</span><span className="dashboard-spending-bar"><i style={{ width: `${spendingTotal ? item.amount / spendingTotal * 100 : 0}%` }} /></span><strong>{hidden ? '••••' : formatVnd(item.amount)}</strong>
      </Link>)}</div>}
    </section>
    <section className="account-section dashboard-recent"><div className="account-section-title"><h2>Giao dịch gần đây</h2><Link to="/transactions">Xem tất cả</Link></div>
      {loadError ? <div className="account-empty"><h3>Không tải được dữ liệu</h3><p>Kiểm tra kết nối rồi tải lại trang.</p></div> : recentActivity.length === 0 ? <div className="account-empty"><span className="account-empty-icon"><ReceiptText aria-hidden="true" /></span><h3>Chưa có giao dịch nào</h3><p>Các khoản thu, chi và chuyển ví sẽ xuất hiện tại đây.</p></div> : <div className="dashboard-activity-list">{recentActivity.map((activity) => <article className="dashboard-activity-row" key={`${activity.type}-${activity.id}`}>
        <span className={`dashboard-activity-icon dashboard-activity-${activity.type.toLowerCase()}`}>{activity.type === 'INCOME' ? <ArrowDown aria-hidden="true" /> : activity.type === 'EXPENSE' ? <ArrowUp aria-hidden="true" /> : <ArrowLeftRight aria-hidden="true" />}</span>
        <div className="dashboard-activity-copy"><strong>{activity.title}</strong><small>{activity.subtitle}</small></div>
        <div className="dashboard-activity-value"><strong className={`dashboard-amount-${activity.type.toLowerCase()}`}>{hidden ? '••••' : `${activity.type === 'INCOME' ? '+' : activity.type === 'EXPENSE' ? '−' : ''}${formatVnd(activity.amount)}`}</strong><small>{new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short' }).format(new Date(activity.occurredAt))}</small></div>
      </article>)}</div>}
    </section>
    <section className="account-session-card"><ShieldCheck aria-hidden="true" /><div><h2>Không gian tài chính của bạn</h2><p>Đang đăng nhập với tài khoản <strong>{session.user.username}</strong>.</p></div></section>
    <div className="account-shortcuts"><Link to="/account"><ShieldCheck aria-hidden="true" /><span>Tài khoản &amp; bảo mật</span></Link><Link to="/wallets"><Wallet aria-hidden="true" /><span>Ví của tôi</span></Link></div>
  </>;
}
