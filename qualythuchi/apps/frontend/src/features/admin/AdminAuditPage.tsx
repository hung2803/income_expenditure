import { usePageLoader } from '@/hooks/use-page-loader';
import { useMemo, useState } from 'react';
import { ChevronLeft, FileClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminAuditEvent } from '../../infrastructure/api/admin';
import './admin.css';

const actionLabels: Record<string, string> = { CREATE: 'Tạo dữ liệu', UPSERT: 'Cập nhật dữ liệu', UPDATE: 'Cập nhật dữ liệu', DELETE: 'Xóa dữ liệu' };
const entityLabels: Record<string, string> = { transaction: 'Giao dịch', wallet: 'Ví', category: 'Danh mục', transfer: 'Chuyển khoản', user: 'Tài khoản' };

export function AdminAuditPage() {
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  usePageLoader(async (controller, refreshing) => {
    await adminApi.listAudit(100, controller.signal).then((items) => { if (!controller.signal.aborted) { setEvents(items); setError(''); } }).catch((error: unknown) => { if (refreshing) throw error; if (!controller.signal.aborted) setError('Không tải được nhật ký quản trị.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, 'admin-audit');
  const filtered = useMemo(() => events.filter((event) => `${event.actorUsername} ${event.ownerUsername} ${event.action} ${event.entity} ${event.recordId}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))), [events, query]);
  return <div className="admin-page">
    <header className="admin-page-heading"><Link to="/more" aria-label="Quay lại"><ChevronLeft /></Link><div><h1>Nhật ký quản trị</h1><p>Theo dõi thay đổi do Super Admin thực hiện</p></div></header>
    <label className="admin-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo người thực hiện, User hoặc hành động" /></label>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {loading ? <div className="admin-empty">Đang tải nhật ký…</div> : filtered.length === 0 ? <section className="admin-empty"><FileClock /><h2>Chưa có hoạt động quản trị</h2><p>Các thay đổi tài chính được ghi nhận sẽ hiển thị tại đây.</p></section> : <section className="admin-audit-list">{filtered.map((event) => {
      const Icon = event.action === 'DELETE' ? Trash2 : event.action === 'CREATE' ? Plus : Pencil;
      return <details className="admin-audit-card" key={event.id}><summary><span className={`admin-audit-icon ${event.action === 'DELETE' ? 'admin-expense' : event.action === 'CREATE' ? 'admin-income' : ''}`}><Icon /></span><span className="admin-audit-copy"><strong>{actionLabels[event.action] ?? event.action} · {entityLabels[event.entity] ?? event.entity}</strong><small>{event.actorUsername} → {event.ownerUsername} · {event.recordId}</small></span><time dateTime={new Date(event.createdAt).toISOString()}>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.createdAt))}</time></summary><div className="admin-audit-details"><p><b>Người thực hiện:</b> @{event.actorUsername}</p><p><b>Tài khoản đích:</b> @{event.ownerUsername}</p>{event.beforeJson && <p><b>Trước:</b> <code>{event.beforeJson}</code></p>}{event.afterJson && <p><b>Sau:</b> <code>{event.afterJson}</code></p>}</div></details>;
    })}</section>}
  </div>;
}
