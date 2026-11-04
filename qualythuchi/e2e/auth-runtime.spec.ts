import { expect, test } from '@playwright/test';
import { AUTH_TEST_ACCOUNTS, AUTH_TEST_PASSWORD } from '../apps/backend/test/auth-fixtures';

// No request interception: browser -> frontend proxy -> real Workers + local D1.
test('LAN origins pass through the frontend proxy while foreign origins remain blocked', async ({ request }) => {
  // Only Host/Origin are simulated; requests still go to the real local preview.
  // An empty payload exercises origin validation without attempting a password.
  const host = '192.0.2.10:4173';
  const own = await request.post('/auth/login', { headers: { Host: host, Origin: `http://${host}` }, data: {} });
  expect(own.status()).toBe(400);
  expect(await own.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } });
  const foreign = await request.post('/auth/login', { headers: { Host: host, Origin: 'https://foreign.example' }, data: {} });
  expect(foreign.status()).toBe(403);
  expect(await foreign.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } });
});

test('real username/password login, role guards and logout work through the app', async ({ page, context, browserName }) => {
  const user = AUTH_TEST_ACCOUNTS.find((account) => account.id === `e2e-${browserName}-user`)!;
  const admin = AUTH_TEST_ACCOUNTS.find((account) => account.id === `e2e-${browserName}-admin`)!;
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Tên đăng nhập hoặc mật khẩu không đúng.');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(AUTH_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: user.displayName, exact: true })).toBeVisible();
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === 'thu_chi_dev_session');
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe('Lax');
  const access = await page.evaluate(async (ids) => {
    const own = await fetch(`/api/users/${ids.user}`);
    const other = await fetch(`/api/users/${ids.admin}?role=SUPER_ADMIN`);
    const admin = await fetch('/api/admin/users');
    const me = await fetch('/auth/me');
    return { own: own.status, other: other.status, admin: admin.status, me: await me.json() };
  }, { user: user.id, admin: admin.id });
  expect(access).toMatchObject({ own: 200, other: 403, admin: 403, me: { user: { id: user.id, role: 'USER' } } });
  await page.reload();
  await expect(page.getByRole('heading', { name: user.displayName, exact: true })).toBeVisible();
  const csrfDenied = await page.evaluate(async () => {
    const response = await fetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return response.status;
  });
  expect(csrfDenied).toBe(403);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).some((cookie) => cookie.name === 'thu_chi_dev_session')).toBe(false);
  expect((await page.request.get('/auth/me')).status()).toBe(401);
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(admin.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(AUTH_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: admin.displayName, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Khác', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Quản trị hệ thống' })).toBeVisible();
  expect((await page.request.get('/api/admin/users')).status()).toBe(200);
  expect((await page.request.get(`/api/users/${user.id}`)).status()).toBe(200);
  await expect(page.locator('body')).not.toContainText(user.displayName);
});
