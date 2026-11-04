import type { AuthSession, LoginRequest } from '@thu-chi/contracts';
import { ApiError } from '../../infrastructure/api/http';
import { loginErrorMessage } from './session';
import type { AuthApi } from './session';

export interface AuthData {
  lastUser(): string | null;
  remember(id: string): void;
  forget(): void;
  pendingLogout(): boolean;
  setPendingLogout(pending: boolean): void;
  clear(id: string): Promise<void>;
  notify(): void;
}

export interface AuthState {
  status: 'checking' | 'anonymous' | 'authenticated' | 'signing-in' | 'signing-out' | 'blocked' | 'unavailable';
  session: AuthSession | null;
  message: string | null;
}

export class AuthStore {
  private state: AuthState = { status: 'checking', session: null, message: null };
  private listeners = new Set<() => void>();
  private request?: AbortController;
  private generation = 0;
  private knownSession: AuthSession | null = null;
  private localOwner: string | null = null;

  constructor(private api: AuthApi, private data: AuthData) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  private set(status: AuthState['status'], session: AuthSession | null = null, message: string | null = null) {
    this.state = { status, session, message };
    for (const listener of this.listeners) listener();
  }

  private begin(status: AuthState['status']) {
    this.request?.abort();
    this.request = new AbortController();
    this.generation++;
    this.set(status);
    return { generation: this.generation, signal: this.request.signal };
  }

  private async clearPrevious(except?: string) {
    const remembered = this.data.lastUser();
    const owners = new Set<string>();
    if (remembered && remembered !== except) owners.add(remembered);
    if (this.localOwner && this.localOwner !== except) owners.add(this.localOwner);
    for (const id of owners) await this.data.clear(id);
    // Another tab may have already cleared/replaced the shared marker. This tab
    // must still scrub its own sessionStorage using its remembered local owner.
    if (remembered !== except && this.data.lastUser() === remembered) this.data.forget();
    if (this.localOwner !== except) this.localOwner = null;
  }

  private async accept(session: AuthSession, generation: number) {
    if (generation !== this.generation) return;
    await this.clearPrevious(session.user.id);
    if (generation !== this.generation) return;
    this.data.remember(session.user.id);
    this.localOwner = session.user.id;
    this.knownSession = session;
    this.set('authenticated', session);
  }

  private block(message: string) {
    this.knownSession = null;
    try { this.data.setPendingLogout(true); } catch { /* The blocked UI still prevents account switching. */ }
    this.set('blocked', null, message);
  }

  refresh = async () => {
    if (['signing-in', 'signing-out', 'blocked'].includes(this.state.status)) return;
    try { if (this.data.pendingLogout()) { await this.logout(); return; } } catch {
      this.block('Không thể truy cập bộ nhớ ứng dụng. Vui lòng kiểm tra cài đặt trình duyệt rồi thử lại.');
      return;
    }
    const { generation, signal } = this.begin('checking');
    try {
      let session: AuthSession;
      try {
        session = await this.api.me(signal);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
        // Retry once after app resume. Some Safari versions can briefly omit
        // cookies on a resumed fetch; the server no longer clears the cookie
        // on this read-only check, so a transient miss cannot destroy the login.
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (generation !== this.generation) return;
        session = await this.api.me(signal);
      }
      await this.accept(session, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      if (!(error instanceof ApiError && error.status === 401)) {
        this.set('unavailable', null, 'Chưa xác minh được phiên đăng nhập. Kiểm tra kết nối rồi thử lại; phiên và dữ liệu trên thiết bị vẫn được giữ.');
        return;
      }
      const hadSession = Boolean(this.knownSession || this.data.lastUser());
      this.knownSession = null;
      try { await this.clearPrevious(); } catch {
        this.block('Chưa thể xóa dữ liệu tài khoản cũ. Đóng các tab khác của ứng dụng rồi thử lại.');
        return;
      }
      if (generation !== this.generation) return;
      let message = hadSession ? 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.' : null;
      if (error instanceof ApiError && error.serverCode === 'SESSION_COOKIE_MISSING') {
        message = 'Máy chủ không nhận được cookie đăng nhập từ Safari. Hãy đăng nhập lại trong tab thường và giữ nguyên địa chỉ app.';
      } else if (error instanceof ApiError && error.serverCode === 'SESSION_NOT_ACTIVE') {
        message = 'Cookie đã tới máy chủ nhưng session trong D1 không còn hiệu lực. Hãy đăng nhập lại; nếu tiếp tục, cần kiểm tra backend đang dùng đúng volume dữ liệu.';
      }
      this.set('anonymous', null, message);
    }
  };

  login = async (credentials: LoginRequest) => {
    if (this.state.status !== 'anonymous') return;
    const { generation, signal } = this.begin('signing-in');
    try {
      await this.clearPrevious();
    } catch {
      this.block('Chưa thể xóa dữ liệu tài khoản cũ. Đóng các tab khác của ứng dụng rồi thử lại.');
      return;
    }
    if (generation !== this.generation) return;
    let issuedSession: AuthSession;
    try {
      issuedSession = await this.api.login(credentials, signal);
    } catch (error) {
      if (generation !== this.generation) return;
      this.knownSession = null;
      this.set('anonymous', null, loginErrorMessage(error));
      return;
    }
    if (generation !== this.generation) return;
    let session: AuthSession;
    try {
      // Confirm the browser accepted the HttpOnly cookie before treating the
      // login as durable. The token itself remains inaccessible to JavaScript.
      session = await this.api.me(signal);
      if (session.user.id !== issuedSession.user.id) throw new ApiError('INVALID_RESPONSE', 'Phiên đăng nhập không khớp tài khoản vừa xác thực.');
    } catch (error) {
      if (generation !== this.generation) return;
      this.knownSession = null;
      if (error instanceof ApiError && error.status === 401) {
        this.set('anonymous', null, error.serverCode === 'SESSION_NOT_ACTIVE'
          ? 'Đăng nhập đã nhận nhưng D1 từ chối session. Kiểm tra backend và volume dữ liệu rồi thử lại.'
          : 'Mật khẩu đã được chấp nhận nhưng Safari không gửi lại cookie phiên. Kiểm tra cookie của website và đăng nhập lại ở cùng địa chỉ.');
      } else {
        this.set('unavailable', null, 'Đăng nhập đã được gửi nhưng chưa xác minh được cookie với máy chủ. Hãy kiểm tra mạng rồi nhấn Thử lại.');
      }
      return;
    }
    try {
      await this.accept(session, generation);
      if (generation === this.generation) this.data.notify();
    } catch {
      if (generation !== this.generation) return;
      this.block('Không thể lưu trạng thái tài khoản an toàn. Vui lòng thử lại đăng xuất.');
    }
  };

  loginWithProvider = async (provider: () => Promise<AuthSession>) => {
    if (this.state.status !== 'anonymous') return;
    const { generation, signal } = this.begin('signing-in');
    try { await this.clearPrevious(); } catch {
      this.block('Chưa thể xóa dữ liệu tài khoản cũ. Đóng các tab khác của ứng dụng rồi thử lại.');
      return;
    }
    if (generation !== this.generation) return;
    try {
      const issued = await provider();
      if (generation !== this.generation) return;
      const confirmed = await this.api.me(signal);
      if (confirmed.user.id !== issued.user.id) throw new ApiError('INVALID_RESPONSE', 'Phiên đăng nhập không khớp tài khoản vừa xác thực.');
      await this.accept(confirmed, generation);
      if (generation === this.generation) this.data.notify();
    } catch (error) {
      if (generation !== this.generation) return;
      this.knownSession = null;
      this.set('anonymous', null, loginErrorMessage(error));
    }
  };

  logout = async () => {
    if (this.state.status === 'signing-out') return;
    const previous = this.knownSession;
    const { generation, signal } = this.begin('signing-out');
    this.knownSession = null;
    try {
      // Persist the intent first: a reload cannot silently restore an unrevoked cookie.
      this.data.setPendingLogout(true);
      this.data.notify();
      await this.clearPrevious();
      let session = previous;
      if (!session) {
        try { session = await this.api.me(signal); } catch (error) {
          if (!(error instanceof ApiError && error.status === 401)) throw error;
        }
      }
      if (session) {
        try { await this.api.logout(session.csrfToken, signal); } catch (error) {
          if (!(error instanceof ApiError && error.status === 401)) throw error;
        }
      }
      if (generation !== this.generation) return;
      this.data.setPendingLogout(false);
      this.data.notify();
      this.set('anonymous', null, 'Đã đăng xuất an toàn.');
    } catch {
      if (generation !== this.generation) return;
      this.block('Chưa thể hoàn tất đăng xuất. Kiểm tra kết nối, đóng các tab khác của ứng dụng rồi thử lại.');
    }
  };

  lock = () => {
    if (['authenticated', 'checking', 'unavailable'].includes(this.state.status)) this.begin('checking');
  };

  synchronize = async () => {
    if (this.state.status === 'signing-in') this.begin('checking');
    await this.refresh();
  };

  dispose = () => { this.request?.abort(); this.generation++; };
}
