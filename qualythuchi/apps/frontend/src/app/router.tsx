import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { FoundationPage } from '../features/dashboard/FoundationPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RootLayout } from './RootLayout';
import { RouteErrorPage } from '@/features/system/RouteErrorPage';
import { NotFoundPage } from '@/features/system/NotFoundPage';
import { OfflinePage } from '@/features/system/OfflinePage';
import { AuthGuard } from '@/features/auth/AuthGuard';
import { AccountShell } from '@/features/account/AccountShell';
import { AccountDashboard } from '@/features/account/AccountDashboard';
import { CalendarPage } from '@/features/account/CalendarPage';
import { AccountPage } from '@/features/account/AccountPage';
import { MorePage } from '@/features/account/MorePage';
import { WalletsPage } from '@/features/finance/WalletsPage';
import { BudgetsPage } from '@/features/finance/BudgetsPage';
import { CategoriesPage } from '@/features/finance/CategoriesPage';
import { TransactionsPage } from '@/features/finance/TransactionsPage';
import { TransactionFormPage } from '@/features/finance/TransactionFormPage';
import { TransferPage } from '@/features/finance/TransferPage';
import { SyncPage } from '@/features/account/SyncPage';
import { AdminUsersPage } from '@/features/admin/AdminUsersPage';
import { AdminFinancePage } from '@/features/admin/AdminFinancePage';
import { AdminAuditPage } from '@/features/admin/AdminAuditPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';

const ReportsPage = lazy(() => import('@/features/finance/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const AdvancedSearchPage = lazy(() => import('@/features/finance/AdvancedSearchPage').then((module) => ({ default: module.AdvancedSearchPage })));
const SavingsGoalsPage = lazy(() => import('@/features/finance/SavingsAndRecurringPages').then((module) => ({ default: module.SavingsGoalsPage })));
const RecurringTransactionsPage = lazy(() => import('@/features/finance/SavingsAndRecurringPages').then((module) => ({ default: module.RecurringTransactionsPage })));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LoginPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'offline', element: <OfflinePage /> },
      { path: 'setup', element: <AppShell />, children: [{ index: true, element: <FoundationPage /> }] },
      { element: <AuthGuard />, children: [
        { element: <AccountShell />, children: [
          { path: 'dashboard', element: <AccountDashboard /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'more', element: <MorePage /> },
          { path: 'sync', element: <SyncPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'transactions/new', element: <TransactionFormPage /> },
          { path: 'transactions/:transactionId', element: <TransactionFormPage /> },
          { path: 'search', element: <Suspense fallback={<div className="account-empty" role="status">Đang tải…</div>}><AdvancedSearchPage /></Suspense> },
          { path: 'transfers', element: <TransferPage /> },
          { path: 'reports', element: <Suspense fallback={<div className="account-empty" role="status">Đang tải…</div>}><ReportsPage /></Suspense> },
          { path: 'wallets', element: <WalletsPage /> },
          { path: 'budgets', element: <BudgetsPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'savings', element: <Suspense fallback={<div className="account-empty" role="status">Đang tải…</div>}><SavingsGoalsPage /></Suspense> },
          { path: 'recurring', element: <Suspense fallback={<div className="account-empty" role="status">Đang tải…</div>}><RecurringTransactionsPage /></Suspense> },
          { element: <AuthGuard role="SUPER_ADMIN" />, children: [
            { path: 'admin/users', element: <AdminUsersPage /> },
            { path: 'admin/finance', element: <AdminFinancePage /> },
            { path: 'admin/audit', element: <AdminAuditPage /> }
          ] }
        ] }
      ] },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
]);
