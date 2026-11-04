import type { ApiErrorResponse } from '@thu-chi/contracts';
import { ConfigurationError } from '../../config/environment.ts';
import { AuthError } from './errors.ts';
import { authenticate, login, logout } from './service.ts';
import { sessionCookie } from './tokens.ts';

export function authErrorResponse(error: unknown): Response {
  const status = error instanceof AuthError ? error.status : 500;
  const body: ApiErrorResponse = { error: {
    code: error instanceof AuthError ? error.code : error instanceof ConfigurationError ? 'CONFIGURATION_ERROR' : 'INTERNAL_ERROR',
    message: error instanceof AuthError ? error.message : 'Hệ thống chưa sẵn sàng. Vui lòng thử lại sau.'
  } };
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '900' } : {}) } });
}

export async function handleAuth(action: 'login' | 'logout' | 'me', request: Request, env: Env): Promise<Response> {
  try {
    if (request.method !== (action === 'me' ? 'GET' : 'POST')) throw new AuthError(405, 'METHOD_NOT_ALLOWED', 'Phương thức không được hỗ trợ.');
    if (action === 'login') {
      const result = await login(request, env);
      return Response.json(result.dto, { headers: { 'Set-Cookie': sessionCookie(request, env, result.token), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (action === 'me') {
      const session = await authenticate(request, env);
      return Response.json(session.dto, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    await logout(request, env);
    return new Response(null, { status: 204, headers: { 'Set-Cookie': sessionCookie(request, env, null), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const response = authErrorResponse(error);
    // A missing cookie on a transient `/me` check must not erase a still-valid
    // persistent cookie. In particular, Safari can omit cookies on a resumed
    // page request. Explicit logout still clears the browser cookie on 401.
    if (action === 'logout' && error instanceof AuthError && error.status === 401) response.headers.set('Set-Cookie', sessionCookie(request, env, null));
    return response;
  }
}
