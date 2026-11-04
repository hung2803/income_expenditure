import type { ApiTransaction } from '../../infrastructure/api/finance';

type CalendarTransaction = Pick<ApiTransaction, 'type' | 'amount' | 'occurredAt' | 'deletedAt'>;
export type CalendarDay = { day: number; date: string; income: number; expense: number; today: boolean };

export function monthCalendar(transactions: CalendarTransaction[], now = new Date(), currentDate = now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const key = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const days: CalendarDay[] = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => ({
    day: index + 1, date: key(index + 1), income: 0, expense: 0,
    today: year === currentDate.getFullYear() && month === currentDate.getMonth() && index + 1 === currentDate.getDate()
  }));
  for (const transaction of transactions) {
    const date = new Date(transaction.occurredAt);
    if (transaction.deletedAt || date.getFullYear() !== year || date.getMonth() !== month) continue;
    const day = days[date.getDate() - 1];
    if (transaction.type === 'INCOME') day.income += transaction.amount;
    else if (transaction.type === 'EXPENSE') day.expense += transaction.amount;
  }
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: Array<CalendarDay | null> = Array.from({ length: Math.ceil((offset + days.length) / 7) * 7 }, (_, index) => days[index - offset] ?? null);
  return { year, month: month + 1, weeks: Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7)) };
}

export function compactCalendarAmount(value: number) {
  const format = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  if (value >= 1_000_000_000) return `${format.format(value / 1_000_000_000)}tỷ`;
  if (value >= 1_000_000) return `${format.format(value / 1_000_000)}tr`;
  if (value >= 1_000) return `${format.format(value / 1_000)}k`;
  return String(value);
}
