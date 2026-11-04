import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { AuthSession } from '@thu-chi/contracts';

const user = (admin = false): AuthSession => ({
  user: { id: admin ? 'admin-1' : 'user-a', username: admin ? 'admin' : 'an', displayName: admin ? 'Quản trị viên' : 'Nguyễn An', role: admin ? 'SUPER_ADMIN' : 'USER' },
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  csrfToken: 'e2e-memory-csrf'
});

// Only this test fixture simulates auth. The production bundle always calls the backend.
async function authServer(context: BrowserContext, initial: AuthSession | null = null) {
  const server = { session: initial, logoutOffline: false, loginStatus: 200, loginCalls: 0 };
  await context.route('**/auth/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'Cache-Control': 'no-store' };
    if (path === '/auth/me') return route.fulfill({ status: server.session ? 200 : 401, json: server.session ?? {}, headers });
    if (path === '/auth/login') {
      server.loginCalls++;
      const body = request.postDataJSON();
      if (server.loginStatus !== 200) return route.fulfill({ status: server.loginStatus, json: { error: { message: 'internal error must not be displayed' } }, headers });
      if (body.password !== 'test-password') return route.fulfill({ status: 401, json: {}, headers });
      server.session = user(body.username === 'admin');
      return route.fulfill({ json: server.session, headers });
    }
    if (path === '/auth/logout') {
      if (server.logoutOffline) return route.abort('failed');
      if (request.headers()['x-csrf-token'] !== 'e2e-memory-csrf') return route.fulfill({ status: 403, json: {}, headers });
      server.session = null;
      return route.fulfill({ status: 204, headers });
    }
    return route.fulfill({ status: 404, json: {}, headers });
  });
  return server;
}

async function login(page: Page, username = 'an', password = 'test-password') {
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

async function confirmLogout(page: Page) {
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Đăng xuất tài khoản?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
}

test('protected deep link redirects to login and returns to the requested page after authentication', async ({ context, page }) => {
  await authServer(context);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Phiên đã được xác thực')).toHaveCount(0);
  await login(page);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Nguyễn An' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nguyễn An' })).toBeVisible();
});

test('validation, incorrect credentials and rate limiting show safe and accessible errors', async ({ context, page }) => {
  const server = await authServer(context);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Vui lòng nhập tên đăng nhập.')).toBeVisible();
  expect(server.loginCalls).toBe(0);
  await login(page, 'an', 'wrong-password');
  await expect(page.getByRole('alert')).toHaveText('Tên đăng nhập hoặc mật khẩu không đúng.');
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toHaveValue('an');
  server.loginStatus = 429;
  await login(page);
  await expect(page.getByRole('alert')).toContainText('Bạn đã thử quá nhiều lần');
  await expect(page.locator('body')).not.toContainText('internal error');
});

test('User never sees admin navigation and direct admin URLs are denied', async ({ context, page }) => {
  await authServer(context, user());
  await page.goto('/more');
  await expect(page.getByRole('link', { name: /Thông tin cá nhân/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Quản trị hệ thống' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeVisible();
  await page.getByRole('link', { name: 'Về trang chủ' }).click();
  await expect(page.getByRole('heading', { name: /Xin chào, Nguyễn An/ })).toBeVisible();
});

test('Super Admin sees administration links and can open an admin route', async ({ context, page }) => {
  await authServer(context);
  await page.goto('/login');
  await login(page, 'admin');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: 'Khác', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Quản trị hệ thống' })).toBeVisible();
  await page.getByRole('link', { name: /Quản lý người dùng/ }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý người dùng', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toHaveCount(0);
});

test('logout scrubs account data, keeps the app shell and prevents history from revealing private pages', async ({ context, page }) => {
  await authServer(context, user());
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Nguyễn An' })).toBeVisible();
  await page.evaluate(async () => {
    localStorage.setItem('thu-chi:user:user-a:transactions', 'private-old-user-data');
    sessionStorage.setItem('thu-chi:user:user-a:profile', 'private-old-user-data');
    localStorage.setItem('unrelated-preference', 'keep');
    const request = indexedDB.open('thu-chi:user:user-a:data', 1);
    await new Promise<void>((resolve, reject) => { request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
    await (await caches.open('thu-chi:user:user-a:api')).put('/private-test', new Response('private-old-user-data'));
    await (await caches.open('workbox-app-shell-sentinel')).put('/shell-test', new Response('keep'));
  });
  await confirmLogout(page);
  await expect(page).toHaveURL(/\/login$/);
  const storage = await page.evaluate(async () => ({
    local: localStorage.getItem('thu-chi:user:user-a:transactions'),
    session: sessionStorage.getItem('thu-chi:user:user-a:profile'),
    preference: localStorage.getItem('unrelated-preference'),
    caches: await caches.keys(),
    databases: (await indexedDB.databases()).map((db) => db.name),
    values: Object.values(localStorage).join(' ')
  }));
  expect(storage.local).toBeNull();
  expect(storage.session).toBeNull();
  expect(storage.preference).toBe('keep');
  expect(storage.caches).not.toContain('thu-chi:user:user-a:api');
  expect(storage.caches).toContain('workbox-app-shell-sentinel');
  expect(storage.databases).not.toContain('thu-chi:user:user-a:data');
  expect(storage.values).not.toContain('e2e-memory-csrf');
  await page.goBack();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toHaveCount(0);
  await login(page, 'admin');
  await expect(page.getByRole('heading', { name: /Xin chào, Quản trị viên/ })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Nguyễn An');
});

test('offline logout cannot restore the old session on reload and supports retry', async ({ context, page }) => {
  const server = await authServer(context, user());
  await page.goto('/account');
  server.logoutOffline = true;
  await confirmLogout(page);
  await expect(page.getByRole('heading', { name: 'Cần hoàn tất đăng xuất' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cần hoàn tất đăng xuất' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nguyễn An' })).toHaveCount(0);
  server.logoutOffline = false;
  await page.getByRole('button', { name: 'Thử lại đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(server.session).toBeNull();
});

test('logout in another tab locks the old account view', async ({ context, page }) => {
  await authServer(context, user());
  await page.goto('/account');
  const second = await context.newPage();
  await second.goto('/dashboard');
  await expect(second.getByRole('heading', { name: /Xin chào, Nguyễn An/ })).toBeVisible();
  await second.evaluate(() => sessionStorage.setItem('thu-chi:user:user-a:profile', 'private-other-tab'));
  await page.bringToFront();
  await confirmLogout(page);
  await second.bringToFront();
  await expect(second).toHaveURL(/\/login$/);
  await expect(second.getByRole('heading', { name: /Xin chào, Nguyễn An/ })).toHaveCount(0);
  expect(await second.evaluate(() => sessionStorage.getItem('thu-chi:user:user-a:profile'))).toBeNull();
});

test('an IndexedDB connection held by another view blocks account switching until cleanup succeeds', async ({ context, page }) => {
  await authServer(context, user());
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Nguyễn An' })).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open('thu-chi:user:user-a:data', 1);
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => { (window as Window & { authTestDatabase?: IDBDatabase }).authTestDatabase = request.result; resolve(); };
      request.onerror = () => reject(request.error);
    });
  });
  await confirmLogout(page);
  await expect(page.getByRole('heading', { name: 'Cần hoàn tất đăng xuất' })).toBeVisible();
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toHaveCount(0);
  await page.evaluate(() => { (window as Window & { authTestDatabase?: IDBDatabase }).authTestDatabase?.close(); });
  await page.getByRole('button', { name: 'Thử lại đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('a revoked session is rechecked on focus and private content is removed', async ({ context, page }) => {
  const server = await authServer(context, user());
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Xin chào, Nguyễn An/ })).toBeVisible();
  server.session = null;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toHaveText('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toHaveCount(0);
});
