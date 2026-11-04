import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { useAuth } from './auth-context';
import { returnPath } from './session';
import { AuthStatus } from './AuthStatus';
import { LoginIcon } from './components/LoginIcons';
import { WalletIllustration } from './components/WalletIllustration';
import { startAuthentication } from '@simplewebauthn/browser';
import { parseSession } from './session';
import { createHttpClient } from '../../infrastructure/api/http';
import './login.css';

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const pending = auth.status === 'signing-in' || auth.status === 'checking';
  const success = auth.message === 'Đã đăng xuất an toàn.';

  useEffect(() => { if (auth.message && !success) errorRef.current?.focus(); }, [auth.message, success]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const next = { username: username.trim() ? undefined : 'Vui lòng nhập tên đăng nhập.', password: password ? undefined : 'Vui lòng nhập mật khẩu.' };
    setErrors(next);
    setMessage('');
    if (next.username || next.password) { (next.username ? usernameRef : passwordRef).current?.focus(); return; }
    await auth.login({ username: username.trim(), password });
    setPassword('');
  }

  async function handlePasskey() {
    if (pending) return;
    setMessage('');
    await auth.loginWithProvider(async () => {
      const http = createHttpClient(import.meta.env.VITE_API_BASE_URL ?? '');
      const challenge = await http.post<{ ceremonyId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('/auth/passkeys/login/options');
      const credential = await startAuthentication({ optionsJSON: challenge.options });
      return parseSession(await http.post<unknown>('/auth/passkeys/login/verify', { ceremonyId: challenge.ceremonyId, credential }));
    });
  }

  if (auth.status === 'blocked' || auth.status === 'signing-out' || auth.status === 'unavailable') return <AuthStatus />;
  if (auth.status === 'authenticated' && auth.session) {
    return <Navigate to={returnPath((location.state as { from?: unknown } | null)?.from, auth.session.user.role)} replace />;
  }

  return <main className="login-page">
    <div className="login-panel">
      <header className="login-header">
        <WalletIllustration />
        <h1>Đăng nhập</h1>
        <p>Quản lý thu chi cá nhân an toàn và tiện lợi</p>
      </header>

      <form className="login-form" onSubmit={(event) => { void handleSubmit(event); }} noValidate aria-busy={pending}>
        <label className="login-input">
          <LoginIcon name="user" />
          <span className="login-sr-only">Tên đăng nhập</span>
          <input ref={usernameRef} name="username" type="text" placeholder="Tên đăng nhập" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={128} value={username} onChange={(event) => { setUsername(event.target.value); setErrors((current) => ({ ...current, username: undefined })); }} aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'login-username-error' : undefined} disabled={auth.status === 'signing-in'} required />
        </label>
        {errors.username && <p className="login-field-error" id="login-username-error">{errors.username}</p>}
        <div className="login-input">
          <LoginIcon name="lock" />
          <label htmlFor="login-password" className="login-sr-only">Mật khẩu</label>
          <input ref={passwordRef} id="login-password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Mật khẩu" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })); }} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'login-password-error' : undefined} disabled={auth.status === 'signing-in'} required />
          <button className="login-password-toggle" type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} aria-controls="login-password" onClick={() => setShowPassword((visible) => !visible)}>
            <LoginIcon name={showPassword ? 'eye-off' : 'eye'} />
          </button>
        </div>
        {errors.password && <p className="login-field-error" id="login-password-error">{errors.password}</p>}

        <div className="login-forgot-row">
          <button type="button" className="login-forgot" onClick={() => setMessage('Chức năng khôi phục mật khẩu sẽ được bổ sung khi kết nối hệ thống.')}>Quên mật khẩu?</button>
        </div>

        {auth.message && <div ref={errorRef} className={`login-feedback ${success ? 'login-feedback-success' : ''}`} role={success ? 'status' : 'alert'} tabIndex={-1}>
          <AlertCircle aria-hidden="true" /><p>{auth.message}</p>
        </div>}

        <button type="submit" className="login-button login-button-primary" disabled={pending}>
          <span>{auth.status === 'signing-in' ? 'Đang đăng nhập…' : auth.status === 'checking' ? 'Đang kiểm tra…' : 'Đăng nhập'}</span>{pending ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <LoginIcon name="arrow" />}
        </button>
        <button type="button" className="login-button login-button-passkey" onClick={() => { void handlePasskey(); }} disabled={pending}>
          <LoginIcon name="key" /><span>{pending ? 'Đang xác thực…' : 'Đăng nhập bằng Passkey'}</span>
        </button>
      </form>

      <div className="login-divider"><span>hoặc</span></div>

      <button type="button" className="login-button login-button-apple" onClick={() => setMessage('Đăng nhập với Apple ID chưa được kết nối trong bản xem trước này.')}>
        <LoginIcon name="apple" /><span>Đăng nhập với Apple ID</span>
      </button>

      <div className="login-security"><LoginIcon name="shield" /><span>Bảo vệ tài khoản và dữ liệu cá nhân</span></div>
      <p className="login-message" role="status" aria-live="polite">{message}</p>
      <footer className="login-footer">Chỉ Admin mới có thể tạo tài khoản mới</footer>
    </div>
  </main>;
}
