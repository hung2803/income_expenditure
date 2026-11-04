import { expect, test } from '@playwright/test';

test('real Workers/D1 health is ready through the frontend proxy', async ({ request, page }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({
    status: 'ok', service: 'thu-chi-api', environment: 'test', checks: { database: 'ok' }
  });
  await page.goto('/login');
  const health = await page.evaluate(async () => {
    const response = await fetch('/api/health', { cache: 'no-store' });
    return { status: response.status, body: await response.json() };
  });
  expect(health.status).toBe(200);
  expect((health.body as { checks: { database: string } }).checks.database).toBe('ok');
});

test('health CORS allows the test frontend and rejects an unknown origin', async ({ request }) => {
  const response = await request.get('/api/health', { headers: { Origin: 'https://untrusted.example' } });
  expect(response.status()).toBe(403);
  expect(response.headers()['access-control-allow-origin']).toBeUndefined();
  const preflight = await request.fetch('/api/health', {
    method: 'OPTIONS',
    headers: { Origin: 'http://127.0.0.1:4173', 'Access-Control-Request-Method': 'GET' }
  });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()['access-control-allow-origin']).toBe('http://127.0.0.1:4173');
});
