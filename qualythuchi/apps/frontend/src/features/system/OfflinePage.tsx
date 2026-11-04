import { WifiOff } from 'lucide-react';
import { SystemPage } from './SystemPage';
import { useNetworkStatus } from '@/hooks/use-network-status';

export function OfflinePage() {
  const online = useNetworkStatus();
  return <SystemPage icon={<WifiOff />} title={online ? 'Đã có kết nối mạng' : 'Bạn đang ngoại tuyến'} retry>
    <p>{online ? 'Bạn có thể quay lại ứng dụng và thử kết nối hệ thống.' : 'Bạn vẫn có thể xem giao diện đã lưu trên thiết bị. Đăng nhập và kết nối hệ thống sẽ cần mạng trở lại.'}</p>
  </SystemPage>;
}
