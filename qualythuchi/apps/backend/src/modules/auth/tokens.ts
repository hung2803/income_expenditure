import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { SESSION_LIFETIME_MS, sessionCookieSettings } from './config.ts';

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export const newSessionToken = () => randomBytes(32).toString('base64url');
// Domain separation: exposing this token never exposes the HttpOnly session ID.
export const csrfForSession = (token: string) => hashToken(`thu-chi:csrf:v1:${token}`);

export function equalCsrf(actual: string | null, expected: string): boolean {
  return Boolean(actual && /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected)));
}

export function readSessionToken(request: Request, env: Env): string | null {
  const { name } = sessionCookieSettings(request, env);
  const values = (request.headers.get('Cookie') ?? '').split(';').map((item) => item.trim()).filter((item) => item.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function sessionCookie(request: Request, env: Env, token: string | null): string {
  const { name, secure } = sessionCookieSettings(request, env);
  return `${name}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_LIFETIME_MS / 1000 : 0}${secure ? '; Secure' : ''}`;
}
