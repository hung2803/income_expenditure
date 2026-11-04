import { expect, test } from '@playwright/test';

test('login and not-found routes render without JavaScript errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await page.getByRole('link', { name: 'Về đăng nhập' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test('manifest references usable PNG icons and standalone launch', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const response = await page.request.get(href!);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.scope).toBe('/');
  expect(manifest.start_url).toBe('/');
  for (const icon of manifest.icons) {
    const result = await page.evaluate(async (src: string) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    expect(result).toBe(icon.sizes);
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
});

test('router catches a render failure without exposing its internal message', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', {
      get() { throw new Error('test-only network detection failure'); }
    });
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Chưa thể mở màn hình này' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('test-only network detection failure');
});

test('cached app shell supports offline reload and deep links without caching API responses', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service worker interception is verified in Chromium; iPhone offline is also a manual acceptance check.');
  await page.goto('/login');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.route('**/api/health*', (route) => route.fulfill({ json: { status: 'ok', service: 'thu-chi-api' } }));
  const result = await page.evaluate(async () => {
    const url = `${location.origin}/api/health?cache-probe=foundation`;
    await fetch(url);
    for (const name of await caches.keys()) {
      if (await (await caches.open(name)).match(url)) return 'cached';
    }
    return 'not-cached';
  });
  expect(result).toBe('not-cached');
  await context.setOffline(true);
  await page.goto('/offline');
  await expect(page.getByRole('heading', { name: 'Bạn đang ngoại tuyến' })).toBeVisible();
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await expect(page.getByText('Bạn đang offline. Đăng nhập và kết nối hệ thống cần có mạng.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
});

test('login fits a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/login');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
