import { Bell, Grid2X2, House, MoreHorizontal, PieChart, Wallet } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import './account.css';

const tabs = [
  { to: '/dashboard', label: 'Trang chủ', icon: House },
  { to: '/transactions', label: 'Thu chi', icon: Grid2X2 },
  { to: '/reports', label: 'Báo cáo', icon: PieChart },
  { to: '/wallets', label: 'Ví', icon: Wallet },
  { to: '/more', label: 'Khác', icon: MoreHorizontal }
];

export function AccountShell() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return null;
  const { user } = session;
  const initials = user.displayName.trim().split(/\s+/).slice(-2).map((word) => word[0]).join('');
  return <div className="account-page" key={user.id}>
    <div className="account-surface">
      <header className="account-header">
        <Link className="account-brand" to="/dashboard" aria-label="Thu Chi — Trang chủ"><Wallet aria-hidden="true" /><span>Thu Chi</span></Link>
        <div className="account-header-user">
          {user.role === 'SUPER_ADMIN' && <span className="account-role">Super Admin</span>}
          <Link className="account-notification-link" to="/notifications" aria-label="Trung tâm thông báo"><Bell aria-hidden="true" /></Link>
          <Link className="account-avatar" to="/account" aria-label="Thông tin tài khoản">{initials}</Link>
        </div>
      </header>
      <main className="account-main"><Outlet /></main>
      <nav className="account-tabs" aria-label="Điều hướng chính">
        {tabs.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive || (to === '/more' && (location.pathname === '/account' || location.pathname.startsWith('/admin/'))) || (to === '/wallets' && location.pathname === '/categories') ? 'account-tab account-tab-active' : 'account-tab'}>
          <Icon aria-hidden="true" /><span>{label}</span>
        </NavLink>)}
      </nav>
    </div>
  </div>;
}
