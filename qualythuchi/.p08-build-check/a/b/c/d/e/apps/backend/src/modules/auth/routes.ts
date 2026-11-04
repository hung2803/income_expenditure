import { Hono } from 'hono';
import { handleAuth } from './handler';

export const authRoutes = new Hono<{ Bindings: Env }>();
authRoutes.all('/login', (c) => handleAuth('login', c.req.raw, c.env));
authRoutes.all('/logout', (c) => handleAuth('logout', c.req.raw, c.env));
authRoutes.all('/me', (c) => handleAuth('me', c.req.raw, c.env));
