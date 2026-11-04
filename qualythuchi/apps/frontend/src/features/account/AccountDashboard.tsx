import { usePageLoader } from '@/hooks/use-page-loader';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Bell, Eye, EyeOff, ShieldCheck, Tags, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { WalletIllustration } from '../auth/components/WalletIllustration';
import { formatVnd } from '../finance/finance-data';
import { financeApi } from '@/infrastructure/api/finance';
import type { ApiBudget, ApiTransaction, ApiTransfer, ApiWallet, FinanceSummary } from '@/infrastructure/api/finance';
import { calculateMonthlyTotals, calculateWalletBalances } from '../finance/finance-ledger';
import { cacheRemoteList, listLocalRecords } from '@/infrastructure/sync/sync-storage';
import { localMonthKey, summarizeBudgetMonth } from '../finance/budgets-data';
import { DashboardPlans } from './DashboardPlans';
const dashboardEntities = ['transaction', 'transfer', 'wallet', 'budget'] as const;


export function AccountDashboard() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [hidden, setHidden] = useState(false);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loadError, setLoadError] = useState(false);

  usePageLoader(async (controller, refreshing) => {
    await Promise.all([financeApi.getSummary(userId, controller.signal), financeApi.listBudgets(userId, controller.signal), financeApi.listTransactions(userId, controller.signal)]).then(async ([data, nextBudgets, nextTransactions]) => {
      const [localBudgets, localTransactions] = await Promise.all([
        cacheRemoteList(userId, 'budgets', nextBudgets, controller.signal),
        cacheRemoteList(userId, 'transactions', nextTransactions, controller.signal)
      ]);
      if (controller.signal.aborted) return;
      setSummary(data);
      setBudgets(localBudgets);
      setTransactions(localTransactions);
      setLoadError(false);
    }).catch(async (error: unknown) => {
      if (controller.signal.aborted) return;
      if (refreshing) throw error;
      try {
        const [walletRecords, transactionRecords, transferRecords, budgetRecords] = await Promise.all([
          listLocalRecords<ApiWallet>(userId, 'wallets'), listLocalRecords<ApiTransaction>(userId, 'transactions'), listLocalRecords<ApiTransfer>(userId, 'transfers'), listLocalRecords<ApiBudget>(userId, 'budgets')
        ]);
        const wallets = walletRecords.map((record) => record.value);
        const transactions = transactionRecords.filter((record) => !record.deleted && !record.value.deletedAt).map((record) => record.value);
        const transfers = transferRecords.filter((record) => !record.deleted).map((record) => record.value);
        const nextBudgets = budgetRecords.filter((record) => !record.deleted).map((record) => record.value);
        if (controller.signal.aborted) return;
        setBudgets(nextBudgets);
        if (controller.signal.aborted) return;
        setTransactions(transactions);
        const balances = calculateWalletBalances(wallets, transactions, transfers);
        const totals = calculateMonthlyTotals(transactions);
        if (controller.signal.aborted) return;
        setSummary({ totalBalance: [...balances.values()].reduce((sum, balance) => sum + balance, 0), incomeThisMonth: totals.income, expenseThisMonth: totals.expense, recent: [] });
        setLoadError(false);
      } catch { setLoadError(true); }
    });
  }, userId, dashboardEntities);


  const budgetSummary = useMemo(() => summarizeBudgetMonth(localMonthKey(), budgets, transactions), [budgets, transactions]);
  if (!session) return null;
  return <>
    <div className="account-page-title"><div className="dashboard-greeting-row"><h1>Xin chào, {session.user.displayName} <span aria-hidden="true">👋</span></h1><Link className="account-notification-link" to="/notifications" aria-label="Trung tâm thông báo"><Bell aria-hidden="true" /></Link></div><p>Theo dõi tài chính hôm nay</p></div>
    <section className="account-balance" aria-label="Tổng quan tài chính">
      <div className="account-balance-top"><div><div className="account-balance-label">Tổng số dư <button type="button" onClick={() => setHidden((value) => !value)} aria-label={hidden ? 'Hiện số dư' : 'Ẩn số dư'} aria-pressed={hidden}>{hidden ? <EyeOff /> : <Eye />}</button></div><p className="account-balance-value">{summary ? hidden ? '••••••' : formatVnd(summary.totalBalance) : '—'}</p></div><WalletIllustration /></div>
      <div className="account-month-summary"><div><span className="account-income-icon"><ArrowUp aria-hidden="true" /></span><p>Thu tháng này<strong>{summary ? hidden ? '••••' : formatVnd(summary.incomeThisMonth) : '—'}</strong></p></div><div><span className="account-expense-icon"><ArrowDown aria-hidden="true" /></span><p>Chi tháng này<strong>{summary ? hidden ? '••••' : formatVnd(summary.expenseThisMonth) : '—'}</strong></p></div></div>
    </section>
    <section className="dashboard-budget-cards" aria-label="Tổng quan ngân sách">
      <Link to="/budgets" className="dashboard-budget-card dashboard-budget-card-remaining"><span className="dashboard-budget-icon"><Wallet aria-hidden="true" /></span><span className="dashboard-budget-copy"><small>{budgetSummary.budgetTotal ? 'Ngân sách còn lại' : 'Ngân sách tháng này'}</small><strong>{budgetSummary.budgetTotal ? hidden ? '••••••' : formatVnd(budgetSummary.remaining) : 'Chưa thiết lập'}</strong><span className="dashboard-budget-progress"><i style={{ width: `${hidden ? 0 : Math.min(100, Math.max(0, budgetSummary.percentUsed))}%` }} /></span></span></Link>
      <Link to="/budgets" className="dashboard-budget-card dashboard-budget-card-used"><span className="dashboard-budget-icon"><ArrowUp aria-hidden="true" /></span><span className="dashboard-budget-copy"><small>Đã sử dụng</small><strong>{budgetSummary.budgetTotal ? hidden ? '•••' : `${Math.round(budgetSummary.percentUsed)}%` : 'Xem ngân sách'}</strong><span>{budgetSummary.budgetTotal ? hidden ? '••••••' : `${formatVnd(budgetSummary.spent)} / ${formatVnd(budgetSummary.budgetTotal)}` : 'Lập kế hoạch chi tiêu'}</span></span></Link>
    </section>
    {loadError && <p className="account-data-note" role="alert">Chưa tải được dữ liệu. Hãy kéo xuống để thử lại.</p>}
    <DashboardPlans key={userId} ownerUserId={userId} hidden={hidden} />
    <section className="account-session-card"><ShieldCheck aria-hidden="true" /><div><h2>Không gian tài chính của bạn</h2><p>Đang đăng nhập với tài khoản <strong>{session.user.username}</strong>.</p></div></section>
    <div className="account-shortcuts"><Link to="/account"><ShieldCheck aria-hidden="true" /><span>Tài khoản &amp; bảo mật</span></Link><Link to="/categories"><Tags aria-hidden="true" /><span>Danh mục</span></Link></div>
  </>;
}
