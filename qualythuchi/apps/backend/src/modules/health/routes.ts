import { Hono } from 'hono';
import { checkHealth } from './service';

export const healthRoutes = new Hono<{ Bindings: Env }>();
healthRoutes.get('/', async (c) => {
  const result = await checkHealth(c.env);
  return c.json(result, result.status === 'ok' ? 200 : 503);
});
