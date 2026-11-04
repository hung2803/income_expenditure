import { CalendarDays, Grid2X2, House, MoreHorizontal, PieChart, Wallet } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import './account.css';

const tabs = [
  { to: '/dashboard', label: 'Trang chủ', icon: House },
  { to: '/transactions', label: 'Thu chi', icon: Grid2X2 },
  { to: '/calendar', label: 'Lịch', icon: CalendarDays },
  { to: '/reports', label: 'Báo cáo', icon: PieChart },
  { to: '/wallets', label: 'Ví', icon: Wallet },
  { to: '/more', label: 'Khác', icon: MoreHorizontal }
];

export function AccountShell() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return null;
  const { user } = session;
  const isDashboard = location.pathname === '/dashboard';
  const isCalendar = location.pathname === '/calendar';
  return <div className="account-page" key={user.id}>
    <div className="account-surface">
      <main className={`account-main${isDashboard ? ' account-main-dashboard' : isCalendar ? ' account-main-calendar' : ' account-main-page'}`}><Outlet /></main>
      <nav className="account-tabs" aria-label="Điều hướng chính">
        {tabs.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive || (to === '/more' && (location.pathname === '/account' || location.pathname.startsWith('/admin/'))) || (to === '/wallets' && location.pathname === '/categories') ? 'account-tab account-tab-active' : 'account-tab'}>
          <Icon aria-hidden="true" /><span>{label}</span>
        </NavLink>)}
      </nav>
    </div>
  </div>;
}
