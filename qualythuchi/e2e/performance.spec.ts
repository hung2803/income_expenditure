import { expect, test } from '@playwright/test';
import { AUTH_TEST_PASSWORD } from '../apps/backend/test/auth-fixtures';

// Read-only timings on the separate .wrangler/test database. No dev data or
// session secrets are written into the report. Compare on the same machine.
test('local dashboard and API timings', async ({ page, context, browserName }, testInfo) => {
  const origin = 'http://127.0.0.1:4173';
  const login = await page.request.post('/auth/login', { headers: { Origin: origin }, data: {
    username: `e2e-${browserName}-user`, password: AUTH_TEST_PASSWORD
  } });
  expect(login.ok()).toBe(true);
  const { user } = await login.json() as { user: { id: string } };
  const timings: Record<string, unknown> = {};
  for (const path of ['/api/health', ...['summary', 'wallets', 'categories', 'transactions', 'budgets', 'savings-goals', 'recurring-schedules'].map((name) => `/api/users/${user.id}/${name}`)]) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const response = await page.request.get(path);
      expect(response.ok()).toBe(true);
      await response.body();
      samples.push({ ms: +(performance.now() - start).toFixed(2), serverTiming: response.headers()['server-timing'] ?? null });
    }
    timings[path.replace(user.id, ':owner')] = samples;
  }
  const requests: Record<string, number> = {};
  const cdp = browserName === 'chromium' ? await context.newCDPSession(page) : null;
  await cdp?.send('Performance.enable');
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') || path.startsWith('/auth/')) requests[path.replace(user.id, ':owner')] = (requests[path.replace(user.id, ':owner')] ?? 0) + 1;
  });
  const start = performance.now();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tiến độ tiết kiệm', exact: true })).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('region', { name: 'Lịch thu chi', exact: true })).toHaveCount(0);
  const readyMs = performance.now() - start;
  await page.waitForTimeout(500);
  expect(requests['/api/users/:owner/recurring-schedules']).toBe(1);
  expect(requests['/api/users/:owner/savings-goals']).toBe(1);
  const browser = await page.evaluate(() => ({
    navigation: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).toJSON(),
    paints: performance.getEntriesByType('paint').map((entry) => entry.toJSON()),
    api: performance.getEntriesByType('resource').filter((entry) => /\/(api|auth)\//.test(entry.name)).map((entry) => entry.toJSON())
  }));
  const cpu = await cdp?.send('Performance.getMetrics');
  await cdp?.detach();
  await testInfo.attach('local-timings', { body: JSON.stringify({ browserName, readyMs, requests, timings, browser, cpu }, null, 2), contentType: 'application/json' });
});
