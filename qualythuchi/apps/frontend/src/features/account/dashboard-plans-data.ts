import type { ApiRecurringSchedule, ApiSavingsGoal } from '../../infrastructure/api/finance';

export type DashboardBill = Pick<ApiRecurringSchedule, 'id' | 'ownerUserId' | 'name' | 'type' | 'amount' | 'nextDueDate' | 'timezone' | 'isActive'>;
export type DashboardGoal = Pick<ApiSavingsGoal, 'id' | 'ownerUserId' | 'name' | 'targetAmount' | 'savedAmount' | 'dueDate' | 'status'>;

function localDay(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.parse(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
}

export function upcomingBills(items: DashboardBill[], now = new Date()) {
  return items.filter((item) => item.isActive && item.type === 'EXPENSE').map((item) => {
    const daysUntil = Math.round((Date.parse(`${item.nextDueDate}T00:00:00Z`) - localDay(now, item.timezone)) / 86_400_000);
    const dueLabel = daysUntil < 0 ? `Quá hạn ${-daysUntil} ngày` : daysUntil === 0 ? 'Hôm nay' : daysUntil === 1 ? 'Ngày mai' : `Còn ${daysUntil} ngày`;
    return { ...item, daysUntil, dueLabel };
  }).sort((left, right) => left.daysUntil - right.daysUntil || left.name.localeCompare(right.name, 'vi')).slice(0, 3);
}

export function savingsPreview(items: DashboardGoal[]) {
  return items.filter((item) => item.status === 'ACTIVE')
    .sort((left, right) => (left.dueDate ?? '9999-12-31').localeCompare(right.dueDate ?? '9999-12-31') || left.name.localeCompare(right.name, 'vi'))
    .slice(0, 3).map((item) => ({ ...item, percent: Math.min(100, Math.max(0, Math.floor(item.savedAmount * 100 / item.targetAmount))) }));
}

export function formatPlanDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
