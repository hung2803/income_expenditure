import { CalendarDays, Grid2X2, House, MoreHorizontal, PieChart, WalletCards } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import './account.css';

const tabs = [
  { to: '/dashboard', label: 'Trang chủ', icon: House },
  { to: '/transactions', label: 'Thu chi', icon: Grid2X2 },
  { to: '/calendar', label: 'Lịch', icon: CalendarDays },
  { to: '/reports', label: 'Báo cáo', icon: PieChart },
  { to: '/budgets', label: 'Ngân sách', icon: WalletCards },
  { to: '/more', label: 'Khác', icon: MoreHorizontal }
];

export function AccountShell() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return null;
  const { user } = session;
  const isDashboard = location.pathname === '/dashboard';
  const isCalendar = location.pathname === '/calendar';
  // Màn hình thêm/sửa giao dịch dùng toàn màn hình; nút Lưu cố định ở đáy thay cho thanh tab.
  const isTransactionForm = /^\/transactions\/[^/]+$/.test(location.pathname);
  return <div className={`account-page${isTransactionForm ? ' account-page-locked' : ''}`} key={user.id}>
    <div className="account-surface">
      <main className={`account-main${isDashboard ? ' account-main-dashboard' : isCalendar ? ' account-main-calendar' : ' account-main-page'}`}><Outlet /></main>
      {!isTransactionForm && <nav className="account-tabs" aria-label="Điều hướng chính">
        {tabs.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive || (to === '/more' && (['/account', '/categories', '/wallets', '/transfers'].includes(location.pathname) || location.pathname.startsWith('/admin/'))) ? 'account-tab account-tab-active' : 'account-tab'}>
          <Icon aria-hidden="true" /><span>{label}</span>
        </NavLink>)}
      </nav>}
    </div>
  </div>;
}
