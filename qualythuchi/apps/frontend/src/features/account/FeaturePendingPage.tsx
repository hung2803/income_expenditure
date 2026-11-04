import { ChevronLeft, ShieldCheck, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';

export function FeaturePendingPage({ title, admin = false }: { title: string; admin?: boolean }) {
  return <>
    <div className="account-subpage-title"><BackLink to={admin ? '/more' : '/dashboard'} aria-label="Quay lại"><ChevronLeft aria-hidden="true" /></BackLink><div><h1>{title}</h1><p>{admin ? 'Không gian quản trị hệ thống' : 'Tài chính cá nhân của bạn'}</p></div></div>
    {admin && <span className="account-role"><ShieldCheck aria-hidden="true" />Super Admin</span>}
    <section className="account-section account-empty"><span className="account-empty-icon">{admin ? <ShieldCheck aria-hidden="true" /> : <Wallet aria-hidden="true" />}</span><h2>Tính năng đang được hoàn thiện</h2><p>Bạn có thể quay về trang chủ hoặc xem thông tin tài khoản trong thời gian chờ.</p><Link className="account-primary-button" to="/account">Thông tin tài khoản</Link></section>
  </>;
}
