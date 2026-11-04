import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { UserRole } from '@thu-chi/contracts';
import { useAuth } from './auth-context';
import { AuthStatus } from './AuthStatus';
import { ForbiddenPage } from './ForbiddenPage';

export function AuthGuard({ role }: { role?: UserRole }) {
  const auth = useAuth();
  const location = useLocation();
  if (['checking', 'signing-out', 'blocked', 'unavailable'].includes(auth.status)) return <AuthStatus />;
  if (auth.status !== 'authenticated' || !auth.session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && auth.session.user.role !== role) return <ForbiddenPage />;
  return <Outlet />;
}
