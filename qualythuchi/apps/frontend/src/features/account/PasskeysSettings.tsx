import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, KeyRound, LoaderCircle, Trash2 } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuth } from '../auth/auth-context';
import { createHttpClient } from '../../infrastructure/api/http';

interface Passkey { id: string; name: string; deviceType: string; backedUp: boolean; createdAt: number; lastUsedAt: number | null }
const http = createHttpClient(import.meta.env.VITE_API_BASE_URL ?? '');

export function PasskeysSettings() {
  const { session } = useAuth();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    if (!session) return;
    try { setPasskeys((await http.get<{ passkeys: Passkey[] }>('/auth/passkeys')).passkeys); }
    catch { setMessage('Không tải được passkey đã đăng ký.'); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function addPasskey() {
    if (!session || busy) return;
    const name = window.prompt('Đặt tên cho passkey trên thiết bị này:', 'Điện thoại của tôi');
    if (name === null) return;
    setBusy(true); setMessage('');
    try {
      const challenge = await http.post<{ ceremonyId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON']; name: string }>(
        '/auth/passkeys/register/options', { name }, { csrfToken: session.csrfToken });
      const credential = await startRegistration({ optionsJSON: challenge.options });
      await http.post('/auth/passkeys/register/verify', { ceremonyId: challenge.ceremonyId, credential, name: challenge.name }, { csrfToken: session.csrfToken });
      setMessage('Đã thêm passkey cho tài khoản.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error && error.name === 'NotAllowedError' ? 'Bạn đã hủy xác thực passkey.' : 'Không thêm được passkey. Hãy thử lại trên thiết bị đang dùng.');
    } finally { setBusy(false); }
  }

  async function removePasskey(id: string) {
    if (!session || busy || !window.confirm('Xóa passkey này khỏi tài khoản?')) return;
    setBusy(true); setMessage('');
    try { await http.delete(`/auth/passkeys/${encodeURIComponent(id)}`, { csrfToken: session.csrfToken }); setMessage('Đã xóa passkey.'); await refresh(); }
    catch { setMessage('Không xóa được passkey. Hãy thử lại.'); }
    finally { setBusy(false); }
  }

  return <section className="account-section">
    <h2>Passkey</h2>
    <p className="account-passkey-intro">Đăng nhập bằng Face ID, Touch ID hoặc khóa màn hình của thiết bị.</p>
    {loading ? <p className="account-passkey-state">Đang tải danh sách…</p> : passkeys.length === 0 ? <p className="account-passkey-state">Chưa có passkey nào được thêm.</p> : <div className="account-passkey-list">
      {passkeys.map((item) => <div className="account-passkey-row" key={item.id}><span><Fingerprint aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.backedUp ? 'Đồng bộ qua tài khoản thiết bị' : 'Lưu trên thiết bị'} · {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(item.createdAt))}</small></span></span><button type="button" aria-label={`Xóa ${item.name}`} disabled={busy} onClick={() => { void removePasskey(item.id); }}><Trash2 /></button></div>)}
    </div>}
    <button className="account-add-passkey" type="button" onClick={() => { void addPasskey(); }} disabled={busy}>
      {busy ? <LoaderCircle className="auth-spinner" /> : <KeyRound />}<span>{busy ? 'Đang xác thực…' : 'Thêm passkey trên thiết bị này'}</span>
    </button>
    {message && <p className="account-passkey-state" role="status">{message}</p>}
  </section>;
}
