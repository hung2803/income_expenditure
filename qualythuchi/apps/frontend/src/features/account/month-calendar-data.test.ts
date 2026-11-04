import { describe, expect, it } from 'vitest';
import { compactCalendarAmount, monthCalendar } from './month-calendar-data';

describe('monthly income/expense calendar', () => {
  it('sums local calendar days separately, excluding deleted and other-month transactions', () => {
    const occurredAt = new Date(2026, 10, 4, 0, 30).toISOString();
    const data = monthCalendar([
      { type: 'INCOME', amount: 1500000, occurredAt, deletedAt: null },
      { type: 'EXPENSE', amount: 100000, occurredAt, deletedAt: null },
      { type: 'EXPENSE', amount: 25000, occurredAt, deletedAt: null },
      { type: 'EXPENSE', amount: 999, occurredAt, deletedAt: occurredAt },
      { type: 'INCOME', amount: 2000000, occurredAt: new Date(2026, 9, 31, 23, 59).toISOString(), deletedAt: null }
    ], new Date(2026, 10, 4));
    expect(data.weeks.flat().find(day => day?.day === 4)).toMatchObject({ date: '2026-11-04', income: 1500000, expense: 125000, today: true });
    expect(data.weeks.flat().find(day => day?.day === 5)).toMatchObject({ income: 0, expense: 0, today: false });
    expect(data.weeks[0].slice(0, 6)).toEqual(Array(6).fill(null)); // Sunday Nov 1.
    expect(data.weeks[0][6]?.day).toBe(1);
    expect(data.weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it('handles leap years, Monday starts and six-week months', () => {
    expect(monthCalendar([], new Date(2024, 1, 1)).weeks.flat().filter(Boolean)).toHaveLength(29);
    expect(monthCalendar([], new Date(2026, 5, 1)).weeks[0][0]?.day).toBe(1);
    expect(monthCalendar([], new Date(2026, 7, 1)).weeks).toHaveLength(6);
  });

  it('uses compact money labels for small phone cells', () => {
    expect([0, 500, 25000, 1500000, 2000000000].map(compactCalendarAmount)).toEqual(['0', '500', '25k', '1,5tr', '2tỷ']);
  });

  it('keeps today only in the current month when browsing other months or years', () => {
    const today = new Date(2026, 10, 4);
    expect(monthCalendar([], new Date(2026, 9, 1), today).weeks.flat().some(day => day?.today)).toBe(false);
    expect(monthCalendar([], new Date(2026, 10, 1), today).weeks.flat().find(day => day?.today)?.day).toBe(4);
    const january = monthCalendar([], new Date(2026, 12, 1), today);
    expect(january).toMatchObject({ year: 2027, month: 1 });
    expect(january.weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(january.weeks.flat().some(day => day?.today)).toBe(false);
  });
});
