import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { financeApi, type ApiTransaction } from '@/infrastructure/api/finance';
import { cacheRemoteList, listLocalRecords } from '@/infrastructure/sync/sync-storage';
import { usePageLoader } from '@/hooks/use-page-loader';
import { MonthCalendar } from './MonthCalendar';

const calendarEntities = ['transaction'] as const;

export function CalendarPage() {
  const { session } = useAuth();
  const owner = session?.user.id ?? '';
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cached, setCached] = useState(false);

  usePageLoader(async (controller, refreshing) => {
    try {
      const items = await financeApi.listTransactions(owner, controller.signal);
      const merged = await cacheRemoteList(owner, 'transactions', items, controller.signal);
      if (controller.signal.aborted) return;
      setTransactions(merged); setError(false); setCached(false);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (refreshing) throw failure;
      try {
        const records = await listLocalRecords<ApiTransaction>(owner, 'transactions');
        if (controller.signal.aborted) return;
        setTransactions(records.filter(record => !record.deleted).map(record => record.value));
        setCached(true); setError(records.length === 0);
      } catch { if (!controller.signal.aborted) setError(true); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, owner, calendarEntities);

  return <div className="calendar-page">
    <header className="calendar-page-heading"><h1>Lịch thu chi</h1><div>
      <button type="button" className="account-notification-link" aria-label={hidden ? 'Hiện số tiền' : 'Ẩn số tiền'} aria-pressed={hidden} onClick={() => setHidden(value => !value)}>{hidden ? <EyeOff /> : <Eye />}</button>
    </div></header>
    {cached && !error && <p className="month-calendar-note" role="status">Đang xem dữ liệu đã lưu trên thiết bị.</p>}
    <MonthCalendar transactions={transactions} hidden={hidden} loading={loading} error={error} />
  </div>;
}
