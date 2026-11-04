import { describe, expect, it } from 'vitest';
import { savingsPreview, upcomingBills } from './dashboard-plans-data';
import type { DashboardBill, DashboardGoal } from './dashboard-plans-data';

const bill = (id: string, due: string, extra: Partial<DashboardBill> = {}): DashboardBill => ({
  id, ownerUserId: 'a', name: id, type: 'EXPENSE', amount: 250000, nextDueDate: due, timezone: 'Asia/Bangkok', isActive: 1, ...extra
});
const goal = (id: string, extra: Partial<DashboardGoal> = {}): DashboardGoal => ({
  id, ownerUserId: 'a', name: id, targetAmount: 2000000, savedAmount: 500000, dueDate: null, status: 'ACTIVE', ...extra
});

describe('dashboard bills and savings', () => {
  it('shows the nearest three active expenses, with overdue first and no paused/income schedules', () => {
    const items = [bill('later', '2026-12-01'), bill('tomorrow', '2026-11-05'), bill('overdue', '2026-11-02'), bill('today', '2026-11-04'), bill('income', '2026-11-01', { type: 'INCOME' }), bill('paused', '2026-11-01', { isActive: 0 })];
    const preview = upcomingBills(items, new Date('2026-11-04T08:00:00Z'));
    expect(preview.map((item) => item.id)).toEqual(['overdue', 'today', 'tomorrow']);
    expect(preview.map((item) => item.dueLabel)).toEqual(['Quá hạn 2 ngày', 'Hôm nay', 'Ngày mai']);
  });

  it('uses each schedule timezone across midnight instead of UTC or the device date', () => {
    const now = new Date('2026-11-04T18:00:00Z');
    expect(upcomingBills([bill('bangkok', '2026-11-05')], now)[0].dueLabel).toBe('Hôm nay');
    expect(upcomingBills([bill('new-york', '2026-11-05', { timezone: 'America/New_York' })], now)[0].dueLabel).toBe('Ngày mai');
  });

  it('calculates progress from contributed money, caps overfunding, and prioritizes active goals by due date', () => {
    const items = [goal('undated'), goal('completed', { status: 'COMPLETED', dueDate: '2026-11-01' }), goal('paused', { status: 'PAUSED' }), goal('nearest', { dueDate: '2026-11-06', savedAmount: 2500000 }), goal('later', { dueDate: '2026-12-01', savedAmount: 0 }), goal('extra')];
    const preview = savingsPreview(items);
    expect(preview.map((item) => item.id)).toEqual(['nearest', 'later', 'extra']);
    expect(preview[0]).toMatchObject({ savedAmount: 2500000, percent: 100 });
    expect(preview[1].percent).toBe(0);
    expect(preview[2].percent).toBe(25);
    expect(items[0].id).toBe('undated');
  });

  it('returns empty previews for empty data', () => {
    expect(upcomingBills([])).toEqual([]);
    expect(savingsPreview([])).toEqual([]);
  });
});
