import { LoaderCircle, ShieldAlert, WifiOff } from 'lucide-react';
import { useAuth } from './auth-context';
import '../account/account.css';

export function AuthStatus() {
  const { status, message, logout, refresh } = useAuth();
  const blocked = status === 'blocked';
  const unavailable = status === 'unavailable';
  return <main className="auth-status-page">
    <section className="auth-status-card" aria-live="polite" aria-busy={!blocked && !unavailable}>
      <div className="auth-status-icon">{blocked ? <ShieldAlert aria-hidden="true" /> : unavailable ? <WifiOff aria-hidden="true" /> : <LoaderCircle className="auth-spinner" aria-hidden="true" />}</div>
      <h1>{blocked ? 'Cần hoàn tất đăng xuất' : unavailable ? 'Chưa kết nối được máy chủ' : status === 'signing-out' ? 'Đang đăng xuất an toàn…' : 'Đang kiểm tra phiên đăng nhập…'}</h1>
      <p>{blocked || unavailable ? message : 'Vui lòng đợi trong giây lát.'}</p>
      {blocked && <button className="account-primary-button" onClick={() => { void logout(); }}>Thử lại đăng xuất</button>}
      {unavailable && <button className="account-primary-button" onClick={() => { void refresh(); }}>Thử lại</button>}
    </section>
  </main>;
}
