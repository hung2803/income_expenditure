import { usePageLoader } from '@/hooks/use-page-loader';
import { useMemo, useState } from 'react';
import { useModalDialog } from '@/hooks/use-modal-dialog';
import { ChevronLeft, Crown, Pencil, Plus, Search, ShieldCheck, Users, X } from 'lucide-react';
import type { AuthUser } from '@thu-chi/contracts';
import { adminApi, type AdminUser } from '../../infrastructure/api/admin';
import { useAuth } from '../auth/auth-context';
import './admin.css';
import { BackLink } from '@/components/BackLink';

export function AdminUsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'USER' | 'SUPER_ADMIN'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [draft, setDraft] = useState({ username: '', displayName: '', password: '', role: 'USER' as AuthUser['role'], isActive: true });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useModalDialog(dialogOpen);

  async function loadUsers(signal?: AbortSignal, refreshing = false) {
    if (!refreshing) setLoading(true);
    setError('');
    try { const items = await adminApi.listUsers(signal); if (!signal?.aborted) setUsers(items); }
    catch (error) { if (refreshing) throw error; if (!signal?.aborted) setError('Không tải được danh sách tài khoản. Hãy thử tải lại.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  const reloadUsers = usePageLoader((controller, refreshing) => loadUsers(controller.signal, refreshing), 'admin-users');

  const visibleUsers = useMemo(() => users.filter((user) => {
    const matchesRole = filter === 'ALL' || user.role === filter;
    const normalized = query.trim().toLocaleLowerCase('vi');
    return matchesRole && (!normalized || `${user.displayName} ${user.username}`.toLocaleLowerCase('vi').includes(normalized));
  }), [users, query, filter]);
  if (!session) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!editing || draft.password) && (draft.password.length < 8 || draft.password.length > 25)) { setMessage('Mật khẩu phải từ 8 đến 25 ký tự.'); return; }
    setSaving(true); setMessage('');
    try {
      if (editing) {
        const input = { username: draft.username, displayName: draft.displayName, role: draft.role, isActive: draft.isActive, ...(draft.password ? { password: draft.password } : {}) };
        await adminApi.updateUser(editing.id, input, session!.csrfToken);
      } else {
        await adminApi.createUser({ username: draft.username, displayName: draft.displayName, password: draft.password }, session!.csrfToken);
      }
      await reloadUsers(); setDraft({ username: '', displayName: '', password: '', role: 'USER', isActive: true }); setEditing(null); setDialogOpen(false);
    } catch { setMessage(editing ? 'Không lưu được thay đổi. Hãy kiểm tra tên đăng nhập, quyền và trạng thái Admin.' : 'Không tạo được tài khoản. Hãy kiểm tra tên đăng nhập và thử lại.'); }
    finally { setSaving(false); }
  }

  function openCreate() {
    setMessage(''); setEditing(null); setDraft({ username: '', displayName: '', password: '', role: 'USER', isActive: true }); setDialogOpen(true);
  }
  function openEdit(user: AdminUser) {
    setMessage(''); setEditing(user); setDraft({ username: user.username, displayName: user.displayName, password: '', role: user.role, isActive: user.isActive }); setDialogOpen(true);
  }
  async function deactivate(user: AdminUser) {
    const action = user.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại';
    if (!window.confirm(`${action} tài khoản @${user.username}? Dữ liệu tài chính vẫn được giữ nguyên.`)) return;
    try {
      if (user.isActive) await adminApi.deactivateUser(user.id, session!.csrfToken);
      else await adminApi.updateUser(user.id, { isActive: true }, session!.csrfToken);
      await reloadUsers();
    } catch { setError(`Không thể ${action.toLocaleLowerCase('vi')} tài khoản.`); }
  }

  return <div className="admin-page">
    <header className="admin-page-heading"><BackLink to="/more" aria-label="Quay lại"><ChevronLeft /></BackLink><div><span className="account-role"><Crown />Super Admin</span><h1>Quản lý người dùng</h1><p>Quản lý tài khoản người dùng trong hệ thống</p></div><button className="admin-icon-button" type="button" onClick={openCreate} aria-label="Tạo tài khoản"><Plus /></button></header>
    <label className="admin-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc tên đăng nhập" /></label>
    <div className="admin-filter-row" role="tablist" aria-label="Lọc vai trò">
      {([['ALL', `Tất cả (${users.length})`], ['USER', `Người dùng (${users.filter((user) => user.role === 'USER').length})`], ['SUPER_ADMIN', `Quản trị (${users.filter((user) => user.role === 'SUPER_ADMIN').length})`]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'admin-filter-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    <section className="admin-stats-grid"><article><Users /><span><small>Tài khoản</small><strong>{users.length}</strong></span></article><article><ShieldCheck /><span><small>Người dùng</small><strong>{users.filter((user) => user.role === 'USER').length}</strong></span></article></section>
    <section className="admin-list-section"><div className="account-section-title"><h2>Danh sách người dùng</h2><button type="button" className="admin-text-button" onClick={() => void reloadUsers().catch(() => setError('Không tải được danh sách tài khoản.'))} disabled={loading}>Tải lại</button></div>
      {error && <p className="admin-alert" role="alert">{error}</p>}
      {loading ? <div className="admin-empty">Đang tải tài khoản…</div> : visibleUsers.length === 0 ? <div className="admin-empty">Không tìm thấy tài khoản phù hợp.</div> : <div className="admin-user-list">{visibleUsers.map((user) => <article className="admin-user-row" key={user.id}><span className={`admin-user-avatar ${user.role === 'SUPER_ADMIN' ? 'admin-avatar-purple' : ''}`}>{user.displayName.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toLocaleUpperCase()}</span><span className="admin-user-copy"><strong>{user.displayName}</strong><small>@{user.username} · {user.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</small></span><span className={`account-role ${user.role === 'USER' ? 'account-role-user' : ''}`}>{user.role === 'SUPER_ADMIN' ? 'Quản trị' : 'Người dùng'}</span><div className="admin-account-actions"><button type="button" onClick={() => openEdit(user)} aria-label={`Sửa ${user.username}`}><Pencil /></button><button type="button" disabled={user.id === session.user.id && user.isActive} onClick={() => void deactivate(user)}>{user.isActive ? 'Khóa' : 'Mở lại'}</button></div></article>)}</div>}
    </section>
    <dialog ref={dialog} className="admin-dialog" onCancel={() => setDialogOpen(false)}><button className="admin-dialog-close" type="button" onClick={() => setDialogOpen(false)} aria-label="Đóng"><X /></button><h2>{editing ? 'Sửa tài khoản' : 'Tạo tài khoản User'}</h2><p>{editing ? 'Cập nhật thông tin và quyền truy cập.' : 'Tài khoản mới sẽ có quyền Người dùng.'}</p><form className="admin-form" onSubmit={(event) => void submit(event)}><label>Tên hiển thị<input required maxLength={80} value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label><label>Tên đăng nhập<input required maxLength={64} autoComplete="username" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} /></label><label>Mật khẩu<input required={!editing} minLength={editing && !draft.password ? undefined : 8} maxLength={25} type="password" autoComplete={editing ? 'new-password' : 'new-password'} value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /><small>{editing ? 'Để trống nếu không đổi · 8–25 ký tự khi đặt lại' : '8–25 ký tự'}</small></label>{editing && <><label>Vai trò<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AuthUser['role'] })}><option value="USER">Người dùng</option><option value="SUPER_ADMIN">Super Admin</option></select></label><label className="admin-checkbox-label"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />Tài khoản đang hoạt động</label></>}{message && <p className="admin-alert" role="alert">{message}</p>}<div className="admin-form-actions"><button type="button" className="admin-secondary-button" onClick={() => setDialogOpen(false)}>Hủy</button><button type="submit" className="admin-primary-button" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}</button></div></form></dialog>
  </div>;
}
