import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Cloud, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useNetworkStatus } from '../../hooks/use-network-status';
import { syncOutbox, notifySyncChange } from '../../infrastructure/sync/sync-engine';
import { getSyncSnapshot } from '../../infrastructure/sync/sync-storage';
import type { SyncSnapshot } from '../../infrastructure/sync/sync-storage';

const empty: SyncSnapshot = { pending: 0, syncing: 0, error: 0, lastSyncedAt: null, lastError: null };

function timeLabel(value: number | null) {
  if (value === null) return 'Chưa đồng bộ lần nào';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function SyncPage() {
  const { session } = useAuth();
  const online = useNetworkStatus();
  const ownerId = session?.user.id ?? '';
  const [snapshot, setSnapshot] = useState(empty);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!ownerId) return;
    setSnapshot(await getSyncSnapshot(ownerId));
  }, [ownerId]);

  useEffect(() => {
    void refresh();
    const changed = () => { void refresh(); };
    window.addEventListener('thu-chi-sync-change', changed);
    const timer = window.setInterval(changed, 5_000);
    return () => { window.removeEventListener('thu-chi-sync-change', changed); window.clearInterval(timer); };
  }, [refresh]);

  if (!session) return null;
  const runSync = async () => {
    if (!online || busy) return;
    setBusy(true);
    try { await syncOutbox(ownerId, session.csrfToken); }
    finally { await refresh(); setBusy(false); notifySyncChange(); }
  };
  const syncing = busy || snapshot.syncing > 0;
  const failed = snapshot.error > 0;

  return <div className="sync-page">
    <header className="sync-page-heading"><Link to="/more" aria-label="Quay lại"><ArrowLeft /></Link><div><h1>Sao lưu và đồng bộ</h1><p>Giữ dữ liệu trên thiết bị khớp với tài khoản của bạn</p></div></header>
    <section className={`sync-status-card ${failed ? 'sync-status-error' : syncing ? 'sync-status-working' : 'sync-status-ready'}`}>
      <span className="sync-status-icon">{!online ? <WifiOff /> : syncing ? <LoaderCircle className="sync-spin" /> : failed ? <RefreshCw /> : <Cloud />}</span>
      <div><h2>{!online ? 'Đang offline' : syncing ? 'Đang đồng bộ dữ liệu' : failed ? 'Có dữ liệu chưa đồng bộ' : snapshot.lastSyncedAt ? 'Dữ liệu đã đồng bộ' : 'Đang chờ thay đổi'}</h2>
        <p>{!online ? 'Các thay đổi được lưu trên thiết bị và sẽ thử gửi khi có mạng.' : failed ? 'Một số thay đổi cần thử lại. Dữ liệu vẫn được giữ trên thiết bị.' : 'Thay đổi được lưu vào thiết bị trước, sau đó tự gửi khi mở ứng dụng hoặc có kết nối.'}</p>
        <small>{snapshot.lastSyncedAt ? `Đồng bộ gần nhất: ${timeLabel(snapshot.lastSyncedAt)}` : timeLabel(null)}</small>
      </div>
    </section>
    <section className="sync-count-grid" aria-label="Trạng thái hàng đợi">
      <article><span>Chờ gửi</span><strong>{snapshot.pending}</strong><small>Đã lưu trên thiết bị</small></article>
      <article><span>Đang gửi</span><strong>{snapshot.syncing}</strong><small>Đang xử lý với máy chủ</small></article>
      <article><span>Cần thử lại</span><strong>{snapshot.error}</strong><small>{snapshot.error ? 'Chưa mất dữ liệu' : 'Không có lỗi'}</small></article>
    </section>
    {snapshot.lastError && <p className="sync-error-message" role="alert">{snapshot.lastError}</p>}
    <section className="sync-explanation"><CheckCircle2 /><div><strong>Đăng xuất an toàn</strong><p>Đăng xuất xóa dữ liệu phiên đăng nhập. Các thay đổi chưa đồng bộ vẫn được giữ riêng theo tài khoản trên thiết bị.</p></div></section>
    <button className="sync-now-button" type="button" disabled={!online || busy || (snapshot.pending === 0 && snapshot.error === 0)} onClick={() => void runSync()}><RefreshCw className={syncing ? 'sync-spin' : ''} />{!online ? 'Chờ có kết nối mạng' : busy ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}</button>
  </div>;
}
