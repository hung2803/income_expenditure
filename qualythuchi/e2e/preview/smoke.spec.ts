import { expect, test } from '@playwright/test';

test('HTTPS preview serves login, install metadata and the real health API', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/login');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await page.getByLabel('Mật khẩu', { exact: true }).fill('preview-only');
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  expect(await page.evaluate(() => isSecureContext)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await request.get(manifestHref!);
  expect((await manifest.json()).display).toBe('standalone');
  const health = await request.get('/api/health', { headers: { 'Cache-Control': 'no-cache' } });
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok', service: 'thu-chi-api', environment: 'test', checks: { database: 'ok' } });
  expect(health.headers()['x-worker-version']).toMatch(/^[\da-f-]{36}$/i);
  expect(errors).toEqual([]);
});
