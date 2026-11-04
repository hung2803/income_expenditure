import type { MiddlewareHandler } from 'hono';
import type { UserRole } from '@thu-chi/contracts';
import { authenticate, authorizedOwner, checkCsrf } from '../modules/auth/service';
import type { AuthenticatedSession } from '../modules/auth/service';
import { forbidden, unauthorized } from '../modules/auth/errors';

export interface AuthEnvironment {
  Bindings: Env;
  Variables: { auth: AuthenticatedSession; ownerUserId: string };
}

export const requireAuth: MiddlewareHandler<AuthEnvironment> = async (c, next) => {
  c.set('auth', await authenticate(c.req.raw, c.env));
  await next();
};

export const requireCsrf: MiddlewareHandler<AuthEnvironment> = async (c, next) => {
  const session = c.get('auth');
  if (!session) throw unauthorized();
  checkCsrf(c.req.raw, c.env, session);
  await next();
};

export const requireRole = (role: UserRole): MiddlewareHandler<AuthEnvironment> => async (c, next) => {
  const session = c.get('auth');
  if (!session) throw unauthorized();
  if (session.dto.user.role !== role) throw forbidden();
  await next();
};

export const scopeOwner: MiddlewareHandler<AuthEnvironment> = async (c, next) => {
  const session = c.get('auth');
  if (!session) throw unauthorized();
  c.set('ownerUserId', authorizedOwner(session, c.req.param('ownerUserId')));
  await next();
};
