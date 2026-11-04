import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { ApiErrorResponse } from '@thu-chi/contracts';
import { ConfigurationError, getAllowedOrigins, getEnvironment } from '../config/environment';
import { trustedForwardedOrigin } from '../config/proxy-origin';

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const allowedHeaders = ['Content-Type', 'X-CSRF-Token'];

export const apiSecurity: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Vary', 'Origin');
  if (c.env.WORKER_VERSION?.id) c.header('X-Worker-Version', c.env.WORKER_VERSION.id);
  const environment = getEnvironment(c.env.APP_ENV);
  const allowedOrigins = getAllowedOrigins(c.env.CORS_ORIGINS);
  if (environment === 'prod' && allowedOrigins.some((origin) => !origin.startsWith('https://'))) throw new ConfigurationError();
  const forwardedOrigin = trustedForwardedOrigin(c.req.raw, environment);
  const origin = forwardedOrigin ?? c.req.header('Origin');

  // Reject disallowed browser origins before any endpoint handles the request.
  // CORS is not authentication: private routes also enforce cookie sessions/RBAC.
  if (origin && !forwardedOrigin && !allowedOrigins.includes(origin) && origin !== new URL(c.req.url).origin) {
    return c.json<ApiErrorResponse>({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Nguồn truy cập không được phép.' } }, 403);
  }
  if (!origin) return next();

  if (c.req.method === 'OPTIONS') {
    const requestedMethod = c.req.header('Access-Control-Request-Method');
    const requestedHeaders = (c.req.header('Access-Control-Request-Headers') ?? '').split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
    if (!requestedMethod || !methods.includes(requestedMethod) || requestedHeaders.some((header) => !allowedHeaders.some((allowed) => allowed.toLowerCase() === header))) {
      return c.json<ApiErrorResponse>({ error: { code: 'PREFLIGHT_NOT_ALLOWED', message: 'Yêu cầu truy cập không được phép.' } }, 403);
    }
  }

  return cors({
    origin,
    credentials: true,
    allowMethods: methods,
    allowHeaders: allowedHeaders,
    maxAge: 600
  })(c, next);
};
