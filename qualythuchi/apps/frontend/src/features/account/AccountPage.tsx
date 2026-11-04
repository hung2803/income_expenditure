import { useState } from 'react';
import { BadgeCheck, ChevronLeft, Crown, LogOut, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { LogoutDialog } from './LogoutDialog';
import { PasskeysSettings } from './PasskeysSettings';

export function AccountPage() {
  const { session } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  if (!session) return null;
  const { user } = session;
  return <>
    <div className="account-subpage-title"><Link to="/more" aria-label="Quay lại"><ChevronLeft aria-hidden="true" /></Link><div><h1>Tài khoản & bảo mật</h1><p>Quản lý phiên đăng nhập của bạn</p></div></div>
    <section className="account-profile-card"><span className="account-profile-avatar"><UserRound aria-hidden="true" /></span><h2>{user.displayName}</h2><p>@{user.username}</p><span className={`account-role ${user.role === 'USER' ? 'account-role-user' : ''}`}>{user.role === 'SUPER_ADMIN' ? <Crown aria-hidden="true" /> : <UserRound aria-hidden="true" />}{user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Người dùng'}</span></section>
    <section className="account-section"><h2>Thông tin tài khoản</h2><dl className="account-details"><div><dt>Tên hiển thị</dt><dd>{user.displayName}</dd></div><div><dt>Tên đăng nhập</dt><dd>{user.username}</dd></div><div><dt>Vai trò</dt><dd>{user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Người dùng'}</dd></div><div><dt>Phiên có hiệu lực đến</dt><dd>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.expiresAt))}</dd></div></dl></section>
    <section className="account-session-card"><BadgeCheck aria-hidden="true" /><div><h2>Phiên đã được xác thực</h2><p>{user.role === 'SUPER_ADMIN' ? 'Bạn có quyền truy cập các mục quản trị hệ thống.' : 'Bạn đang truy cập không gian tài chính cá nhân của mình.'}</p></div></section>
    <PasskeysSettings />
    <button className="account-logout-button" onClick={() => setLogoutOpen(true)}><LogOut aria-hidden="true" /><span>Đăng xuất</span></button>
    <p className="account-footnote">Đăng xuất trước khi đưa thiết bị cho người khác sử dụng.</p>
    {logoutOpen && <LogoutDialog onClose={() => setLogoutOpen(false)} />}
  </>;
}
