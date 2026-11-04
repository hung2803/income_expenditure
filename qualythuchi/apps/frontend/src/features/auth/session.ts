import type { AuthSession, LoginRequest, UserRole } from '@thu-chi/contracts';
import { ApiError } from '../../infrastructure/api/http';

export interface AuthApi {
  me(signal?: AbortSignal): Promise<AuthSession>;
  login(credentials: LoginRequest, signal?: AbortSignal): Promise<AuthSession>;
  logout(csrfToken: string, signal?: AbortSignal): Promise<void>;
}

export function parseSession(value: unknown): AuthSession {
  const invalid = () => new ApiError('INVALID_RESPONSE', 'Thông tin phiên đăng nhập không hợp lệ.');
  if (!value || typeof value !== 'object') throw invalid();
  const data = value as Record<string, unknown>;
  if (!data.user || typeof data.user !== 'object') throw invalid();
  const user = data.user as Record<string, unknown>;
  for (const key of ['id', 'username', 'displayName']) {
    if (typeof user[key] !== 'string' || !user[key].trim()) throw invalid();
  }
  if (user.role !== 'USER' && user.role !== 'SUPER_ADMIN') throw invalid();
  if (typeof data.csrfToken !== 'string' || !data.csrfToken.trim() || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))) throw invalid();
  if (Date.parse(data.expiresAt) <= Date.now()) throw new ApiError('HTTP', 'Phiên đăng nhập đã hết hạn.', 401);
  return {
    user: { id: user.id as string, username: user.username as string, displayName: user.displayName as string, role: user.role },
    csrfToken: data.csrfToken,
    expiresAt: data.expiresAt
  };
}

const destinations = new Set(['/dashboard', '/account', '/more', '/transactions', '/transfers', '/reports', '/wallets', '/categories', '/admin/users', '/admin/finance', '/admin/audit']);

export function returnPath(value: unknown, role: UserRole): string {
  if (typeof value !== 'string' || !destinations.has(value) || (value.startsWith('/admin/') && role !== 'SUPER_ADMIN')) return '/dashboard';
  return value;
}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tên đăng nhập hoặc mật khẩu không đúng.';
    if (error.status === 403) return 'Yêu cầu đăng nhập bị từ chối. Vui lòng kiểm tra địa chỉ truy cập app và thử lại.';
    if (error.status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.';
    if (error.status === 404 || error.status === 501) return 'Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.';
    if (error.code === 'NETWORK') return 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.';
    if (error.code === 'TIMEOUT') return 'Kết nối quá lâu. Vui lòng thử đăng nhập lại.';
  }
  return 'Chưa thể đăng nhập. Vui lòng thử lại sau.';
}
