import { Outlet } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { PwaNotice } from '@/infrastructure/pwa/PwaNotice';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { SyncCoordinator } from '@/infrastructure/sync/SyncCoordinator';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useHistoryDepthTracker } from '@/hooks/use-go-back';

export function RootLayout() {
  const online = useNetworkStatus();
  useHistoryDepthTracker();
  return <AuthProvider>
    <SyncCoordinator />
    <PullToRefresh />
    {!online && <div role="status" className="app-notice flex items-start justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 pb-3 text-sm text-amber-950">
      <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>Bạn đang offline. Đăng nhập và kết nối hệ thống cần có mạng.</p>
    </div>}
    <Outlet />
    <PwaNotice />
  </AuthProvider>;
}
