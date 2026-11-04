import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ApiTransaction } from '@/infrastructure/api/finance';
import { formatVnd } from '../finance/finance-data';
import { compactCalendarAmount, monthCalendar } from './month-calendar-data';

export function MonthCalendar({ transactions, hidden, loading, error }: { transactions: ApiTransaction[]; hidden: boolean; loading: boolean; error: boolean }) {
  const now = new Date();
  const todayYear = now.getFullYear(); const todayMonth = now.getMonth(); const today = now.getDate();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(todayYear, todayMonth, 1));
  const year = visibleMonth.getFullYear(); const month = visibleMonth.getMonth();
  const calendar = useMemo(() => monthCalendar(transactions, new Date(year, month, 1), new Date(todayYear, todayMonth, today)), [transactions, year, month, todayYear, todayMonth, today]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const days = calendar.weeks.flat();
  const selected = days.find(day => day?.date === selectedDate) ?? days.find(day => day?.today) ?? days.find(day => day !== null);
  const selectedDay = selected?.day;
  const dailyTransactions = useMemo(() => transactions.filter(transaction => {
    const date = new Date(transaction.occurredAt);
    return !transaction.deletedAt && date.getFullYear() === year && date.getMonth() === month && date.getDate() === selectedDay;
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)), [transactions, year, month, selectedDay]);
  function changeMonth(offset: number) {
    setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    setSelectedDate(null);
  }
  return <section className="account-section month-calendar" aria-label="Lịch thu chi" aria-busy={loading}>
    <div className="month-calendar-heading">
      <button type="button" aria-label="Tháng trước" onClick={() => changeMonth(-1)}><ChevronLeft aria-hidden="true" /></button>
      <h2 aria-live="polite"><CalendarDays aria-hidden="true" />Tháng {calendar.month}/{calendar.year}</h2>
      <button type="button" aria-label="Tháng sau" onClick={() => changeMonth(1)}><ChevronRight aria-hidden="true" /></button>
    </div>
    <p className="month-calendar-legend"><span>Thu (+)</span><span>Chi (−)</span></p>
    {error && <p className="month-calendar-note" role="alert">Chưa tải được giao dịch. Hãy kéo xuống để thử lại.</p>}
    <table>
      <caption className="sr-only">Thu chi từng ngày tháng {calendar.month} năm {calendar.year}</caption>
      <thead><tr>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
      <tbody>{calendar.weeks.map((week, index) => <tr key={index}>{week.map((day, column) => {
        if (!day) return <td className="month-calendar-blank" key={column} />;
        const dateLabel = `Ngày ${day.day} tháng ${calendar.month} năm ${calendar.year}`;
        const label = `${dateLabel}: ${hidden ? 'Đã ẩn số tiền' : loading || error ? 'Chưa có dữ liệu' : `Thu ${formatVnd(day.income)}; Chi ${formatVnd(day.expense)}`}`;
        return <td className={`${day.today ? 'month-calendar-today' : ''}${day.date === selected?.date ? ' month-calendar-selected' : ''}`} key={day.date}>
          <button type="button" onClick={() => setSelectedDate(day.date)} aria-label={label} title={label} aria-current={day.today ? 'date' : undefined} aria-pressed={day.date === selected?.date} disabled={loading || error}>
            <span className="month-calendar-day">{day.day}</span>
            <span className={`month-calendar-income${!hidden && !day.income ? ' month-calendar-zero' : ''}`} aria-hidden="true">{hidden ? '•••' : loading || error || !day.income ? '—' : `+${compactCalendarAmount(day.income)}`}</span>
            <span className={`month-calendar-expense${!hidden && !day.expense ? ' month-calendar-zero' : ''}`} aria-hidden="true">{hidden ? '•••' : loading || error || !day.expense ? '—' : `−${compactCalendarAmount(day.expense)}`}</span>
          </button>
        </td>;
      })}</tr>)}</tbody>
    </table>
    {selected && <section className="calendar-day-details" aria-labelledby="calendar-day-details-title" aria-busy={loading}>
      <h2 id="calendar-day-details-title">Thu chi ngày {selected.date.split('-').reverse().join('/')}</h2>
      <div className="calendar-day-totals">
        <div><span>Tổng thu</span><strong className="month-calendar-income">{hidden ? '••••••' : loading || error ? '—' : formatVnd(selected.income)}</strong></div>
        <div><span>Tổng chi</span><strong className="month-calendar-expense">{hidden ? '••••••' : loading || error ? '—' : formatVnd(selected.expense)}</strong></div>
      </div>
      {loading ? <p className="calendar-day-empty" role="status">Đang tải giao dịch…</p> : error ? <p className="calendar-day-empty">Chưa tải được giao dịch ngày này. Hãy kéo xuống để thử lại.</p> : dailyTransactions.length === 0 ? <p className="calendar-day-empty" role="status">Ngày này chưa có giao dịch thu chi.</p> : <ul className="calendar-day-transactions">
        {dailyTransactions.map(transaction => <li key={transaction.id}>
          <span className={`calendar-day-type calendar-day-${transaction.type.toLowerCase()}`} aria-hidden="true">{transaction.type === 'INCOME' ? '+' : '−'}</span>
          <div className="calendar-day-description"><strong>{transaction.note.trim() || (transaction.type === 'INCOME' ? 'Khoản thu' : 'Khoản chi')}</strong><small>{transaction.type === 'INCOME' ? 'Thu' : 'Chi'} · {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(transaction.occurredAt))}</small></div>
          <strong className={`calendar-day-amount month-calendar-${transaction.type === 'INCOME' ? 'income' : 'expense'}`}>{hidden ? '••••••' : `${transaction.type === 'INCOME' ? '+' : '−'}${formatVnd(transaction.amount)}`}</strong>
        </li>)}
      </ul>}
    </section>}
  </section>;
}
