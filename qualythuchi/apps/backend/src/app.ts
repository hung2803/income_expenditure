import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { ApiErrorResponse } from '@thu-chi/contracts';
import { healthRoutes } from './modules/health/routes';
import { apiSecurity } from './middleware/api-security';
import { authRoutes } from './modules/auth/routes';
import { authErrorResponse } from './modules/auth/handler';
import { userRoutes } from './modules/users/routes';
import { financeRoutes } from './modules/finance/routes';
import { syncRoutes } from './modules/finance/sync-routes';
import { notificationRoutes } from './modules/notifications/routes';
import { savingsRecurringRoutes } from './modules/finance/savings-recurring-routes';

export const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', apiSecurity);
app.use('/auth/*', apiSecurity);

app.route('/api/health', healthRoutes);
app.route('/auth', authRoutes);
const passkeys: MiddlewareHandler<{ Bindings: Env }> = async (c) => {
  const { passkeyRoutes } = await import('./modules/auth/passkey-routes');
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/auth\/passkeys/u, '') || '/';
  return passkeyRoutes.fetch(new Request(url, c.req.raw), c.env, c.executionCtx);
};
app.all('/auth/passkeys', passkeys);
app.all('/auth/passkeys/*', passkeys);
app.route('/api', userRoutes);
app.route('/api', financeRoutes);
app.route('/api', syncRoutes);
app.route('/api', notificationRoutes);
app.route('/api', savingsRecurringRoutes);
app.notFound((c) => c.json<ApiErrorResponse>({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy API.' } }, 404));
app.onError((error) => authErrorResponse(error));
