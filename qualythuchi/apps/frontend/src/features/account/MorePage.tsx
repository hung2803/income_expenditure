import { ChevronRight, Cloud, Crown, FileClock, PiggyBank, Repeat2, ShieldCheck, UserRound, Users, Wallet, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

export function MorePage() {
  const { session } = useAuth();
  if (!session) return null;
  const admin = session.user.role === 'SUPER_ADMIN';
  return <>
    <div className="account-page-title"><h1>Cài đặt và bảo mật</h1><p>Tùy chỉnh không gian tài chính của bạn</p></div>
    <section className="account-section"><h2>Tài khoản</h2><div className="account-menu">
      <Link className="account-menu-row" to="/account"><span className="account-menu-icon"><UserRound aria-hidden="true" /></span><div><strong>Thông tin cá nhân</strong><p>{session.user.displayName} · @{session.user.username}</p></div><ChevronRight aria-hidden="true" /></Link>
      <Link className="account-menu-row" to="/account"><span className="account-menu-icon"><ShieldCheck aria-hidden="true" /></span><div><strong>Tài khoản & bảo mật</strong><p>Phiên đăng nhập và đăng xuất</p></div><ChevronRight aria-hidden="true" /></Link>
      <Link className="account-menu-row" to="/sync"><span className="account-menu-icon"><Cloud aria-hidden="true" /></span><div><strong>Sao lưu và đồng bộ</strong><p>Trạng thái dữ liệu và thay đổi đang chờ gửi</p></div><ChevronRight aria-hidden="true" /></Link>
    </div></section>
    <section className="account-section"><h2>Quản lý tài chính</h2><div className="account-menu">
      <Link className="account-menu-row" to="/budgets"><span className="account-menu-icon"><WalletCards aria-hidden="true" /></span><div><strong>Ngân sách</strong><p>Tiến độ và số tiền còn lại trong tháng</p></div><ChevronRight aria-hidden="true" /></Link>
      <Link className="account-menu-row" to="/savings"><span className="account-menu-icon"><PiggyBank aria-hidden="true" /></span><div><strong>Mục tiêu tiết kiệm</strong><p>Theo dõi số tiền đã dành cho từng mục tiêu</p></div><ChevronRight aria-hidden="true" /></Link>
      <Link className="account-menu-row" to="/recurring"><span className="account-menu-icon"><Repeat2 aria-hidden="true" /></span><div><strong>Giao dịch định kỳ</strong><p>Nhắc khoản thu chi lặp lại và chờ bạn xác nhận</p></div><ChevronRight aria-hidden="true" /></Link>
    </div></section>
    {admin && <section className="account-section" aria-label="Quản trị hệ thống"><div className="account-section-title"><h2>Quản trị hệ thống</h2><span className="account-role"><Crown aria-hidden="true" />Super Admin</span></div><div className="account-menu">
      <Link className="account-menu-row" to="/admin/users"><span className="account-menu-icon"><Users aria-hidden="true" /></span><div><strong>Quản lý người dùng</strong><p>Tài khoản và quyền truy cập</p></div><ChevronRight aria-hidden="true" /></Link>
      <Link className="account-menu-row" to="/admin/finance"><span className="account-menu-icon"><Wallet aria-hidden="true" /></span><div><strong>Tài chính theo người dùng</strong><p>Không gian quản trị tài chính</p></div><ChevronRight aria-hidden="true" /></Link>
      <Link className="account-menu-row" to="/admin/audit"><span className="account-menu-icon"><FileClock aria-hidden="true" /></span><div><strong>Nhật ký quản trị</strong><p>Theo dõi hoạt động quản trị</p></div><ChevronRight aria-hidden="true" /></Link>
    </div></section>}
    <p className="account-footnote">Thu Chi · Không gian riêng cho từng tài khoản</p>
  </>;
}
