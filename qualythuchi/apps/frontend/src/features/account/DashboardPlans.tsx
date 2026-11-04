import { useState } from 'react';
import { usePageLoader } from '@/hooks/use-page-loader';
import { CalendarClock, ChevronRight, PiggyBank } from 'lucide-react';
import { Link } from 'react-router-dom';
import { financeApi } from '@/infrastructure/api/finance';
import type { ApiSavingsContribution } from '@/infrastructure/api/finance';
import { listLocalRecords } from '@/infrastructure/sync/sync-storage';
import { formatVnd } from '../finance/finance-data';
import { formatPlanDate, savingsPreview, upcomingBills } from './dashboard-plans-data';
import type { DashboardBill, DashboardGoal } from './dashboard-plans-data';

type PreviewState<T> = { items: T[]; status: 'loading' | 'ready' | 'error'; cached: boolean };
const planEntities = ['recurring_schedule', 'savings_goal', 'savings_contribution'] as const;

export function DashboardPlans({ ownerUserId, hidden }: { ownerUserId: string; hidden: boolean }) {
  const [bills, setBills] = useState<PreviewState<DashboardBill>>({ items: [], status: 'loading', cached: false });
  const [goals, setGoals] = useState<PreviewState<DashboardGoal>>({ items: [], status: 'loading', cached: false });

  usePageLoader(async (controller, refreshing) => {
      const { signal } = controller;
      const billsTask = financeApi.listRecurringSchedules(ownerUserId, signal).then((items) => {
        if (!signal.aborted) setBills({ items, status: 'ready', cached: false });
      }).catch(async (error: unknown) => {
        if (signal.aborted) return;
        if (refreshing) throw error;
        try {
          const records = await listLocalRecords<DashboardBill>(ownerUserId, 'recurring_schedules');
          if (!signal.aborted) setBills({ items: records.filter((record) => !record.deleted).map((record) => record.value), status: records.length ? 'ready' : 'error', cached: true });
        } catch { if (!signal.aborted) setBills({ items: [], status: 'error', cached: false }); }
      });
      const goalsTask = financeApi.listSavingsGoals(ownerUserId, signal).then((items) => {
        if (!signal.aborted) setGoals({ items, status: 'ready', cached: false });
      }).catch(async (error: unknown) => {
        if (signal.aborted) return;
        if (refreshing) throw error;
        try {
          // Sync stores goals and contributions separately, without savedAmount.
          const [records, contributions] = await Promise.all([
            listLocalRecords<Omit<DashboardGoal, 'savedAmount'>>(ownerUserId, 'savings_goals'),
            listLocalRecords<ApiSavingsContribution>(ownerUserId, 'savings_contributions')
          ]);
          const saved = new Map<string, number>();
          for (const record of contributions) if (!record.deleted) saved.set(record.value.goalId, (saved.get(record.value.goalId) ?? 0) + record.value.amount);
          const items = records.filter((record) => !record.deleted).map((record) => ({ ...record.value, savedAmount: saved.get(record.id) ?? 0 }));
          if (!signal.aborted) setGoals({ items, status: records.length ? 'ready' : 'error', cached: true });
        } catch { if (!signal.aborted) setGoals({ items: [], status: 'error', cached: false }); }
      });
      const results = await Promise.allSettled([billsTask, goalsTask]);
      if (results.some((result) => result.status === 'rejected')) throw new Error('Không tải được hóa đơn hoặc tiết kiệm.');
  }, ownerUserId, planEntities);

  const upcoming = upcomingBills(bills.items);
  const savings = savingsPreview(goals.items);
  return <div className="dashboard-plans">
    <section className="dashboard-plan-card" aria-labelledby="dashboard-bills-title" aria-busy={bills.status === 'loading'}>
      <div className="dashboard-plan-heading"><span className="dashboard-plan-icon dashboard-plan-icon-bill"><CalendarClock aria-hidden="true" /></span><h2 id="dashboard-bills-title">Hóa đơn sắp đến hạn</h2><Link to="/recurring" aria-label="Xem tất cả hóa đơn định kỳ"><ChevronRight aria-hidden="true" /></Link></div>
      {bills.status === 'loading' ? <p className="dashboard-plan-message" role="status">Đang tải hóa đơn…</p> : bills.status === 'error' ? <p className="dashboard-plan-message" role="status">Chưa tải được hóa đơn. <Link to="/recurring">Xem giao dịch định kỳ</Link></p> : <>
        {bills.cached && <p className="dashboard-plan-cache">Dữ liệu đã đồng bộ trên thiết bị, có thể chưa mới nhất.</p>}
        {!upcoming.length ? <p className="dashboard-plan-message">Chưa có khoản chi định kỳ đang hoạt động. <Link to="/recurring">Tạo khoản định kỳ</Link></p> : <ul className="dashboard-plan-list">{upcoming.map((bill) => <li key={bill.id}><Link to="/recurring" className="dashboard-bill-row">
          <span className="dashboard-plan-copy"><strong>{bill.name}</strong><span className={bill.daysUntil < 0 ? 'dashboard-bill-overdue' : ''}>{bill.dueLabel} · <time dateTime={bill.nextDueDate}>{formatPlanDate(bill.nextDueDate)}</time></span></span>
          <strong className="dashboard-bill-amount">{hidden ? '••••••' : formatVnd(bill.amount)}</strong>
        </Link></li>)}</ul>}
      </>}
    </section>
    <section className="dashboard-plan-card" aria-labelledby="dashboard-savings-title" aria-busy={goals.status === 'loading'}>
      <div className="dashboard-plan-heading"><span className="dashboard-plan-icon dashboard-plan-icon-savings"><PiggyBank aria-hidden="true" /></span><h2 id="dashboard-savings-title">Tiến độ tiết kiệm</h2><Link to="/savings" aria-label="Xem tất cả mục tiêu tiết kiệm"><ChevronRight aria-hidden="true" /></Link></div>
      {goals.status === 'loading' ? <p className="dashboard-plan-message" role="status">Đang tải mục tiêu…</p> : goals.status === 'error' ? <p className="dashboard-plan-message" role="status">Chưa tải được tiến độ tiết kiệm. <Link to="/savings">Xem mục tiêu</Link></p> : <>
        {goals.cached && <p className="dashboard-plan-cache">Dữ liệu đã đồng bộ trên thiết bị, có thể chưa mới nhất.</p>}
        {!savings.length ? <p className="dashboard-plan-message">Chưa có mục tiêu đang thực hiện. <Link to="/savings">Tạo mục tiêu tiết kiệm</Link></p> : <ul className="dashboard-plan-list">{savings.map((goal) => <li key={goal.id}><Link to="/savings" className="dashboard-goal-row">
          <span className="dashboard-goal-title"><strong>{goal.name}</strong><span>{hidden ? '•••' : `${goal.percent}%`}</span></span>
          <span className="dashboard-goal-amount">{hidden ? 'Đã ẩn số tiền' : `${formatVnd(goal.savedAmount)} / ${formatVnd(goal.targetAmount)}`}</span>
          {!hidden && <progress max={100} value={goal.percent} aria-label={`Tiến độ ${goal.name}`} />}
          {goal.dueDate && <small>Hạn: <time dateTime={goal.dueDate}>{formatPlanDate(goal.dueDate)}</time></small>}
        </Link></li>)}</ul>}
      </>}
    </section>
  </div>;
}
