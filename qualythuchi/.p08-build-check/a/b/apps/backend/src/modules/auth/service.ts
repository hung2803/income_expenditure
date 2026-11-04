import type { AuthSession } from '@thu-chi/contracts';
import { Buffer } from 'node:buffer';
import { SESSION_LIFETIME_MS, checkRequestOrigin } from './config.ts';
import { AuthError, forbidden, unauthorized } from './errors.ts';
import { verifyPassword } from './password.ts';
import { AuthRepository, publicUser } from './repository.ts';
import { csrfForSession, equalCsrf, hashToken, newSessionToken, readSessionToken } from './tokens.ts';
import { jsonBody, normalizeUsername } from './validation.ts';

export interface AuthenticatedSession { dto: AuthSession; tokenHash: string }

export async function authenticate(request: Request, env: Env, now = Date.now()): Promise<AuthenticatedSession> {
  checkRequestOrigin(request, env);
  const token = readSessionToken(request, env);
  if (!token) throw new AuthError(401, 'SESSION_COOKIE_MISSING', 'Máy chủ không nhận được cookie phiên đăng nhập.');
  const tokenHash = hashToken(token);
  const row = await new AuthRepository(env.DB).findSession(tokenHash, now);
  if (!row) throw new AuthError(401, 'SESSION_NOT_ACTIVE', 'Cookie đã nhận nhưng session không còn hiệu lực.');
  return { tokenHash, dto: { user: publicUser(row), expiresAt: new Date(row.expires_at).toISOString(), csrfToken: csrfForSession(token) } };
}

export async function login(request: Request, env: Env, now = Date.now()): Promise<{ dto: AuthSession; token: string }> {
  checkRequestOrigin(request, env, true);
  const body = await jsonBody(request);
  if (Object.keys(body).some((key) => !['username', 'password'].includes(key))) throw new AuthError(400, 'INVALID_INPUT', 'Thông tin đăng nhập không hợp lệ.');
  const username = normalizeUsername(body.username);
  if (typeof body.password !== 'string' || !body.password || Buffer.byteLength(body.password, 'utf8') > 1024) throw new AuthError(400, 'INVALID_INPUT', 'Thông tin đăng nhập không hợp lệ.');
  const repository = new AuthRepository(env.DB);
  // CF overwrites this header on public Workers requests; local requests share
  // a bucket. The account bucket is enforced even when no IP is available.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!await repository.reserveLogin(username, ip, now)) throw new AuthError(429, 'RATE_LIMITED', 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.');
  const user = await repository.findUser(username);
  const valid = await verifyPassword(body.password, user?.password_hash ?? null);
  if (!valid || !user || user.is_active !== 1) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.');
  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const previous = readSessionToken(request, env);
  if (!await repository.createSession(user, tokenHash, previous ? hashToken(previous) : null, now, now + SESSION_LIFETIME_MS)) throw unauthorized();
  const row = await repository.findSession(tokenHash, now);
  if (!row) throw unauthorized();
  return { token, dto: { user: publicUser(row), expiresAt: new Date(row.expires_at).toISOString(), csrfToken: csrfForSession(token) } };
}

export function checkCsrf(request: Request, env: Env, session: AuthenticatedSession): void {
  checkRequestOrigin(request, env, true);
  if (!equalCsrf(request.headers.get('X-CSRF-Token'), session.dto.csrfToken)) throw new AuthError(403, 'CSRF_INVALID', 'Yêu cầu xác thực thao tác không hợp lệ.');
}

export async function logout(request: Request, env: Env, now = Date.now()): Promise<void> {
  checkRequestOrigin(request, env, true);
  const body = await jsonBody(request);
  if (Object.keys(body).length) throw new AuthError(400, 'INVALID_INPUT', 'Đăng xuất không nhận tham số tài khoản.');
  const session = await authenticate(request, env, now);
  checkCsrf(request, env, session);
  await new AuthRepository(env.DB).revoke(session.tokenHash, now);
}

// Call this with the resource owner read from the database, never with a role
// or owner ID accepted unconditionally from a mutation payload.
export function authorizedOwner(session: AuthenticatedSession, ownerUserId: unknown): string {
  if (typeof ownerUserId !== 'string' || !ownerUserId || ownerUserId.length > 128) throw forbidden();
  if (ownerUserId !== session.dto.user.id && session.dto.user.role !== 'SUPER_ADMIN') throw forbidden();
  return ownerUserId;
}
