import { LogOut, X } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { useModalDialog } from '@/hooks/use-modal-dialog';

export function LogoutDialog({ onClose }: { onClose: () => void }) {
  const dialog = useModalDialog();
  const { logout } = useAuth();
  return <dialog ref={dialog} className="account-dialog" onCancel={onClose} aria-labelledby="logout-title" aria-describedby="logout-description">
    <button className="account-dialog-close" aria-label="Đóng" onClick={onClose}><X aria-hidden="true" /></button>
    <span className="account-empty-icon account-logout-icon"><LogOut aria-hidden="true" /></span>
    <h2 id="logout-title">Đăng xuất tài khoản?</h2>
    <p id="logout-description">Phiên đăng nhập sẽ kết thúc và dữ liệu cục bộ của tài khoản này sẽ được xóa khỏi ứng dụng.</p>
    <div className="account-dialog-actions"><button className="account-secondary-button" onClick={onClose} autoFocus>Ở lại</button><button className="account-danger-button" onClick={() => { void logout(); }}>Đăng xuất</button></div>
  </dialog>;
}
