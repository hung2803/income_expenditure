import { getAllowedOrigins, getEnvironment } from '../../config/environment.ts';
import { trustedForwardedOrigin } from '../../config/proxy-origin.ts';
import { AuthError } from './errors.ts';

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const RATE_WINDOW_MS = 15 * 60 * 1000;

export function sessionCookieSettings(request: Request, env: Env) {
  const environment = getEnvironment(env.APP_ENV);
  const url = new URL(request.url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const secure = url.protocol === 'https:' || Boolean(trustedForwardedOrigin(request, environment));
  if (!secure && !(environment === 'dev' || (environment === 'test' && loopback))) {
    throw new AuthError(426, 'HTTPS_REQUIRED', 'Đăng nhập cần kết nối HTTPS.');
  }
  return { name: secure ? '__Host-thu_chi_session' : 'thu_chi_dev_session', secure };
}

export function checkRequestOrigin(request: Request, env: Env, mutation = false): void {
  sessionCookieSettings(request, env);
  const forwardedOrigin = trustedForwardedOrigin(request, env.APP_ENV);
  const origin = forwardedOrigin ?? request.headers.get('Origin');
  if ((!origin && mutation) || (origin && !forwardedOrigin && origin !== new URL(request.url).origin && !getAllowedOrigins(env.CORS_ORIGINS).includes(origin))) {
    throw new AuthError(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn truy cập không được phép.');
  }
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' && !origin) throw new AuthError(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn truy cập không được phép.');
}
