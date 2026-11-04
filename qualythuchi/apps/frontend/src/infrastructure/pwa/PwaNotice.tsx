import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

export function PwaNotice() {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW();

  async function update() {
    setUpdating(true);
    setError('');
    try {
      await updateServiceWorker(true);
    } catch {
      setError('Chưa thể cập nhật. Vui lòng thử lại khi có mạng.');
    } finally {
      setUpdating(false);
    }
  }

  if (!offlineReady && !needRefresh) return null;
  return <aside aria-label="Trạng thái ứng dụng" className="app-pwa-notice fixed inset-x-4 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl">
    <div role="status" aria-live="polite">
      <p className="text-sm font-semibold">{needRefresh ? 'Có phiên bản mới' : 'Đã lưu giao diện để dùng offline'}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{needRefresh ? 'Lưu các thay đổi trước khi cập nhật ứng dụng.' : 'Bạn có thể mở lại giao diện khi mất mạng. Đăng nhập và kết nối hệ thống vẫn cần mạng.'}</p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
    <div className="mt-3 flex gap-2">
      {needRefresh && <Button disabled={updating} onClick={update}>{updating ? 'Đang cập nhật…' : 'Cập nhật'}</Button>}
      <Button variant="outline" disabled={updating} onClick={() => { setOfflineReady(false); setNeedRefresh(false); }}>Đóng</Button>
    </div>
  </aside>;
}
