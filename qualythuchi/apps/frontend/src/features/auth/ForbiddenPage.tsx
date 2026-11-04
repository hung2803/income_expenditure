import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return <section className="account-empty account-denied">
    <span className="account-empty-icon"><ShieldAlert aria-hidden="true" /></span>
    <p className="account-eyebrow">403 · Giới hạn truy cập</p>
    <h1>Bạn không có quyền truy cập</h1>
    <p>Mục này chỉ dành cho Super Admin. Bạn vẫn có thể quản lý tài chính cá nhân của mình.</p>
    <Link className="account-primary-button" to="/dashboard" replace>Về trang chủ</Link>
  </section>;
}
