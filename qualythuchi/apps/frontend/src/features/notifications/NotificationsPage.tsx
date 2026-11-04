import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CheckCheck, ChevronLeft, Clock3, Dot, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { createHttpClient } from '../../infrastructure/api/http';
import './notifications.css';

interface InboxItem { id: string; kind: 'DAILY_REMINDER' | 'BUDGET_THRESHOLD'; title: string; body: string; payloadJson: string; createdAt: number; readAt: number | null }
interface InboxResponse { notifications: InboxItem[]; unreadCount: number; settings: { timezone: string; pushEnabled: boolean } }
const http = createHttpClient(import.meta.env.VITE_API_BASE_URL ?? '');

function decodeKey(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function NotificationsPage() {
  const { session } = useAuth();
  const [data, setData] = useState<InboxResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [message, setMessage] = useState('');
  const userId = session?.user.id;
  const csrf = session?.csrfToken;
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await http.get<InboxResponse>(`/api/users/${encodeURIComponent(userId)}/notifications`);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      if (result.settings.pushEnabled && result.settings.timezone !== timezone && csrf) {
        await http.put(`/api/users/${encodeURIComponent(userId)}/notifications/settings`, { timezone, pushEnabled: true }, { csrfToken: csrf });
        result.settings.timezone = timezone;
      }
      setData(result);
    }
    catch { setMessage('Không tải được thông báo. Hãy kiểm tra kết nối và thử tải lại.'); }
  }, [csrf, userId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => { if (active) setDeviceSubscribed(Boolean(subscription)); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function setRead(item: InboxItem) {
    if (!userId || !csrf || item.readAt) return;
    try {
      await http.post(`/api/users/${encodeURIComponent(userId)}/notifications/${encodeURIComponent(item.id)}/read`, {}, { csrfToken: csrf });
      await refresh();
    } catch { setMessage('Không cập nhật được thông báo. Hãy thử lại.'); }
  }

  async function markAll() {
    if (!userId || !csrf) return;
    try { await http.post(`/api/users/${encodeURIComponent(userId)}/notifications/read-all`, {}, { csrfToken: csrf }); await refresh(); }
    catch { setMessage('Không thể đánh dấu đã đọc. Hãy thử lại.'); }
  }

  async function togglePush() {
    if (!userId || !csrf || !data || busy) return;
    setBusy(true); setMessage('');
    try {
      if (deviceSubscribed) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/users/${encodeURIComponent(userId)}/notifications/subscriptions`, {
            method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ endpoint: subscription.endpoint })
          });
          if (!response.ok) throw new Error('Không thể hủy đăng ký thông báo. Hãy thử lại.');
          await subscription.unsubscribe();
        }
        setDeviceSubscribed(false);
        setMessage('Đã tắt thông báo đẩy trên thiết bị này.');
      } else {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Thiết bị hoặc trình duyệt chưa hỗ trợ thông báo đẩy.');
        const isIos = /iPhone|iPad|iPod/u.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const installed = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
        if (isIos && !installed) throw new Error('Trên iPhone/iPad, hãy thêm ứng dụng vào Màn hình chính rồi mở ứng dụng từ biểu tượng để bật thông báo.');
        if (Notification.permission === 'denied') throw new Error('Quyền thông báo đang bị chặn trong cài đặt trình duyệt.');
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Bạn chưa cấp quyền hiển thị thông báo.');
        const { publicKey } = await http.get<{ publicKey: string }>('/api/notifications/push-key');
        if (!publicKey) throw new Error('Máy chủ chưa cấu hình dịch vụ thông báo.');
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription()
          ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
        await http.post(`/api/users/${encodeURIComponent(userId)}/notifications/subscriptions`, {
          subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }, { csrfToken: csrf });
        setDeviceSubscribed(true);
        setMessage('Đã bật thông báo trên thiết bị này.');
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể thay đổi thiết lập thông báo.');
    } finally { setBusy(false); }
  }

  if (!session) return null;
  return <div className="notification-page">
    <div className="notification-heading"><Link to="/more" aria-label="Quay lại"><ChevronLeft /></Link><div><h1>Trung tâm thông báo</h1><p>{data?.unreadCount ?? 0} thông báo chưa đọc</p></div></div>
    <section className="notification-settings">
      <div className="notification-setting-icon">{deviceSubscribed ? <Bell /> : <BellOff />}</div>
      <div className="notification-setting-copy"><strong>Thông báo trên thiết bị</strong><p>{deviceSubscribed ? 'Nhắc hằng ngày lúc 21:00 theo múi giờ thiết bị.' : 'Bật để nhận lời nhắc hằng ngày.'}</p></div>
      <button type="button" disabled={!data || busy} onClick={() => { void togglePush(); }}>{busy ? 'Đang xử lý…' : deviceSubscribed ? 'Tắt' : 'Bật'}</button>
    </section>
    <div className="notification-list-heading"><h2>Gần đây</h2>{Boolean(data?.unreadCount) && <button type="button" onClick={() => { void markAll(); }}><CheckCheck /> Đọc tất cả</button>}</div>
    {message && <p role="status" className="notification-message">{message}</p>}
    <div className="notification-list">
      {!data?.notifications.length && <div className="notification-empty"><Smartphone /><strong>Chưa có thông báo</strong><p>Các lời nhắc và cập nhật ngân sách sẽ hiển thị ở đây.</p></div>}
      {data?.notifications.map((item) => <button type="button" key={item.id} className={`notification-item ${item.readAt ? '' : 'notification-unread'}`} onClick={() => { void setRead(item); }}>
        <span className={`notification-item-icon ${item.kind === 'BUDGET_THRESHOLD' ? 'notification-budget' : ''}`}>{item.kind === 'BUDGET_THRESHOLD' ? <Dot /> : <Clock3 />}</span>
        <span className="notification-item-copy"><strong>{item.title}</strong><span>{item.body}</span><time dateTime={new Date(item.createdAt).toISOString()}>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></span>
        {!item.readAt && <span className="notification-unread-dot" aria-label="Chưa đọc" />}
      </button>)}
    </div>
    <p className="notification-privacy">Thông báo đẩy không chứa số dư hay chi tiết giao dịch.</p>
  </div>;
}
