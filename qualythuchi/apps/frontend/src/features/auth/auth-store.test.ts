import { describe, expect, it, vi } from 'vitest';
import type { AuthSession, LoginRequest } from '@thu-chi/contracts';
import { ApiError } from '../../infrastructure/api/http';
import { AuthStore } from './auth-store';
import { loginErrorMessage, parseSession, returnPath } from './session';

function session(id = 'user-a', role: AuthSession['user']['role'] = 'USER'): AuthSession {
  return { user: { id, username: id, displayName: `Name ${id}`, role }, expiresAt: new Date(Date.now() + 60_000).toISOString(), csrfToken: 'memory-only-csrf' };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  let owner: string | null = null;
  let pending = false;
  const api = {
    me: vi.fn<(_signal?: AbortSignal) => Promise<AuthSession>>().mockRejectedValue(new ApiError('HTTP', 'Unauthorized', 401)),
    login: vi.fn<(_credentials: LoginRequest, _signal?: AbortSignal) => Promise<AuthSession>>().mockResolvedValue(session()),
    logout: vi.fn<(_csrf: string, _signal?: AbortSignal) => Promise<void>>().mockResolvedValue(undefined)
  };
  api.login.mockImplementation(async (credentials) => {
    const authenticated = session(credentials.username);
    api.me.mockResolvedValueOnce(authenticated);
    return authenticated;
  });
  const data = {
    lastUser: () => owner,
    remember: (id: string) => { owner = id; },
    forget: () => { owner = null; },
    pendingLogout: () => pending,
    setPendingLogout: (value: boolean) => { pending = value; },
    clear: vi.fn<(_id: string) => Promise<void>>().mockResolvedValue(undefined),
    notify: vi.fn()
  };
  return { api, data, store: new AuthStore(api, data) };
}

describe('validated auth contract and redirects', () => {
  it('does not describe an origin rejection as a disabled account or expose server details', () => {
    const message = loginErrorMessage(new ApiError('HTTP', 'ORIGIN_NOT_ALLOWED internal details', 403));
    expect(message).toContain('địa chỉ truy cập app');
    expect(message).not.toContain('Tài khoản chưa được phép');
    expect(message).not.toContain('internal details');
  });

  it('accepts only supported server roles, complete identities and live sessions', () => {
    expect(parseSession(session()).user.role).toBe('USER');
    expect(parseSession(session('admin', 'SUPER_ADMIN')).user.role).toBe('SUPER_ADMIN');
    for (const invalid of [null, {}, { ...session(), user: { ...session().user, role: 'ADMIN' } }, { ...session(), user: { ...session().user, id: '' } }, { ...session(), csrfToken: '' }, { ...session(), expiresAt: 'invalid' }]) {
      expect(() => parseSession(invalid)).toThrow(ApiError);
    }
    expect(() => parseSession({ ...session(), expiresAt: '2000-01-01T00:00:00Z' })).toThrow(expect.objectContaining({ status: 401 }));
  });

  it('never redirects login outside approved routes or into admin pages for a User', () => {
    for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/login', '/dashboard?role=SUPER_ADMIN', '/admin/users']) {
      expect(returnPath(path, 'USER')).toBe('/dashboard');
    }
    expect(returnPath('/account', 'USER')).toBe('/account');
    expect(returnPath('/categories', 'USER')).toBe('/categories');
    expect(returnPath('/transfers', 'USER')).toBe('/transfers');
    expect(returnPath('/admin/users', 'SUPER_ADMIN')).toBe('/admin/users');
  });
});

describe('account session lifecycle', () => {
  it('accepts passkey login only after the browser returns the issued cookie for the same account', async () => {
    const { store, api, data } = fixture();
    await store.refresh();
    const provider = vi.fn().mockResolvedValue(session('user-a'));
    api.me.mockResolvedValueOnce(session('user-a'));
    await store.loginWithProvider(provider);
    expect(provider).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).toMatchObject({ status: 'authenticated', session: { user: { id: 'user-a' } } });
    expect(data.lastUser()).toBe('user-a');
  });

  it('does not trust remembered identity before the server confirms the session', async () => {
    const { store, api, data } = fixture();
    data.remember('forged-admin');
    const response = deferred<AuthSession>();
    api.me.mockReturnValueOnce(response.promise);
    const loading = store.refresh();
    expect(store.getSnapshot()).toMatchObject({ status: 'checking', session: null });
    response.resolve(session());
    await loading;
    expect(data.clear).toHaveBeenCalledWith('forged-admin');
    expect(store.getSnapshot().session?.user.role).toBe('USER');
    expect(data.lastUser()).toBe('user-a');
  });

  it('restores an existing server session after the app starts again', async () => {
    const { store, api, data } = fixture();
    await store.refresh();
    await store.login({ username: 'user-a', password: 'test' });
    expect(store.getSnapshot().status).toBe('authenticated');

    const reopenedApp = new AuthStore(api, data);
    api.me.mockResolvedValueOnce(session());
    await reopenedApp.refresh();
    expect(api.me).toHaveBeenCalledTimes(4);
    expect(reopenedApp.getSnapshot()).toMatchObject({ status: 'authenticated', session: { user: { id: 'user-a' } } });
  });

  it('does not treat a temporary server or network failure on app reopen as an expired login', async () => {
    const { store, api, data } = fixture();
    data.remember('user-a');
    api.me.mockRejectedValueOnce(new ApiError('NETWORK', 'offline'));
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', session: null });
    expect(data.lastUser()).toBe('user-a');
    expect(data.clear).not.toHaveBeenCalled();

    api.me.mockResolvedValueOnce(session());
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ status: 'authenticated', session: { user: { id: 'user-a' } } });
  });

  it('retries one temporary 401 on resume before ending the session', async () => {
    const { store, api } = fixture();
    api.me.mockRejectedValueOnce(new ApiError('HTTP', 'Unauthorized', 401)).mockResolvedValueOnce(session());
    await store.refresh();
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toMatchObject({ status: 'authenticated', session: { user: { id: 'user-a' } } });
  });

  it('verifies that Safari returns the session cookie after login and reports when it does not', async () => {
    const { store, api } = fixture();
    await store.refresh();
    api.login.mockResolvedValueOnce(session());
    api.me.mockRejectedValueOnce(new ApiError('HTTP', 'Unauthorized', 401, 'SESSION_COOKIE_MISSING'));
    await store.login({ username: 'user-a', password: 'test' });
    expect(api.me).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot()).toMatchObject({
      status: 'anonymous',
      message: 'Mật khẩu đã được chấp nhận nhưng Safari không gửi lại cookie phiên. Kiểm tra cookie của website và đăng nhập lại ở cùng địa chỉ.'
    });
  });

  it('scrubs previous account data before sending new login credentials', async () => {
    const { store, api, data } = fixture();
    await store.refresh();
    data.remember('old-user');
    const cleanup = deferred<void>();
    data.clear.mockReturnValueOnce(cleanup.promise);
    const signingIn = store.login({ username: 'user-a', password: 'not-persisted' });
    expect(api.login).not.toHaveBeenCalled();
    cleanup.resolve();
    await signingIn;
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe('authenticated');
  });

  it('blocks login if old account data cannot be cleared', async () => {
    const { store, api, data } = fixture();
    await store.refresh();
    data.remember('old-user');
    data.clear.mockRejectedValueOnce(new Error('blocked database'));
    await store.login({ username: 'user-a', password: 'test' });
    expect(api.login).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({ status: 'blocked', session: null });
    expect(data.pendingLogout()).toBe(true);
  });

  it('does not submit duplicate login requests or expose provider errors', async () => {
    const { store, api } = fixture();
    await store.refresh();
    const response = deferred<AuthSession>();
    api.login.mockReturnValueOnce(response.promise);
    const first = store.login({ username: 'user-a', password: 'test' });
    await store.login({ username: 'user-b', password: 'test' });
    api.me.mockResolvedValueOnce(session());
    response.resolve(session());
    await first;
    expect(api.login).toHaveBeenCalledTimes(1);
    await store.logout();
    api.login.mockRejectedValueOnce(new ApiError('HTTP', 'database password=secret', 401));
    await store.login({ username: 'user-a', password: 'bad' });
    expect(store.getSnapshot().message).toBe('Tên đăng nhập hoặc mật khẩu không đúng.');
  });

  it('hides private content immediately and waits for remote revocation before account switching', async () => {
    const { store, api, data } = fixture();
    api.me.mockResolvedValueOnce(session());
    await store.refresh();
    const revoke = deferred<void>();
    api.logout.mockReturnValueOnce(revoke.promise);
    const signingOut = store.logout();
    expect(store.getSnapshot()).toMatchObject({ status: 'signing-out', session: null });
    expect(data.pendingLogout()).toBe(true);
    await store.login({ username: 'user-b', password: 'test' });
    expect(api.login).not.toHaveBeenCalled();
    revoke.resolve();
    await signingOut;
    expect(data.clear).toHaveBeenCalledWith('user-a');
    expect(api.logout).toHaveBeenCalledWith('memory-only-csrf', expect.any(AbortSignal));
    expect(data.lastUser()).toBeNull();
    expect(data.pendingLogout()).toBe(false);
    expect(store.getSnapshot().status).toBe('anonymous');
  });

  it('failed logout stays blocked after a reload and can be retried safely', async () => {
    const { store, api, data } = fixture();
    api.me.mockResolvedValueOnce(session());
    await store.refresh();
    api.logout.mockRejectedValueOnce(new ApiError('NETWORK', 'offline'));
    await store.logout();
    expect(store.getSnapshot()).toMatchObject({ status: 'blocked', session: null });
    const restored = new AuthStore(api, data);
    api.me.mockResolvedValueOnce(session());
    await restored.refresh();
    expect(restored.getSnapshot()).toMatchObject({ status: 'anonymous', session: null });
    expect(api.logout).toHaveBeenCalledTimes(2);
    expect(data.pendingLogout()).toBe(false);
  });

  it('ignores a late session check after logout has started', async () => {
    const { store, api } = fixture();
    const response = deferred<AuthSession>();
    api.me.mockReturnValueOnce(response.promise);
    const loading = store.refresh();
    await store.logout();
    response.resolve(session('old-admin', 'SUPER_ADMIN'));
    await loading;
    expect(store.getSnapshot()).toMatchObject({ status: 'anonymous', session: null });
  });

  it('clears private state and account data when the server rejects an expired session', async () => {
    const { store, api, data } = fixture();
    api.me.mockResolvedValueOnce(session());
    await store.refresh();
    store.lock();
    expect(store.getSnapshot().session).toBeNull();
    await store.refresh();
    expect(data.clear).toHaveBeenCalledWith('user-a');
    expect(store.getSnapshot()).toMatchObject({ status: 'anonymous', session: null, message: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.' });
  });

  it('clears this tab account data even if another tab already removed the shared owner marker', async () => {
    const { store, api, data } = fixture();
    api.me.mockResolvedValueOnce(session());
    await store.refresh();
    data.forget();
    await store.refresh();
    expect(data.clear).toHaveBeenCalledWith('user-a');
    expect(store.getSnapshot()).toMatchObject({ status: 'anonymous', session: null });
  });

  it('does not send a delayed login after logout interrupts account cleanup', async () => {
    const { store, api, data } = fixture();
    await store.refresh();
    data.remember('old-user');
    const cleanup = deferred<void>();
    data.clear.mockReturnValueOnce(cleanup.promise);
    const signingIn = store.login({ username: 'user-a', password: 'test' });
    await store.logout();
    cleanup.resolve();
    await signingIn;
    expect(api.login).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({ status: 'anonymous', session: null });
  });

  it('another tab session change cancels an in-flight login before rechecking the server', async () => {
    const { store, api } = fixture();
    await store.refresh();
    const response = deferred<AuthSession>();
    api.login.mockReturnValueOnce(response.promise);
    const signingIn = store.login({ username: 'user-a', password: 'test' });
    await Promise.resolve();
    api.me.mockResolvedValueOnce(session('other-user'));
    await store.synchronize();
    response.resolve(session('old-admin', 'SUPER_ADMIN'));
    await signingIn;
    expect(store.getSnapshot().session?.user.id).toBe('other-user');
    expect(store.getSnapshot().session?.user.role).toBe('USER');
  });
});
