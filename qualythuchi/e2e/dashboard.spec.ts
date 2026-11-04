import { expect, test as base } from '@playwright/test';
import type { AuthSession } from '@thu-chi/contracts';
import { AUTH_TEST_ACCOUNTS, AUTH_TEST_PASSWORD } from '../apps/backend/test/auth-fixtures';

const origin = 'http://127.0.0.1:4173';
base.use({ timezoneId: 'Asia/Bangkok' });
const test = base.extend<{ dashboardUser: { id: string; csrfToken: string } }>({
  dashboardUser: async ({ request, page, browserName }, use) => {
    const admin = AUTH_TEST_ACCOUNTS.find((item) => item.id === `e2e-${browserName}-admin`)!;
    const login = await request.post('/auth/login', { headers: { Origin: origin }, data: { username: admin.username, password: AUTH_TEST_PASSWORD } });
    expect(login.ok()).toBe(true);
    const adminSession = await login.json() as AuthSession;
    const adminHeaders = { Origin: origin, 'X-CSRF-Token': adminSession.csrfToken };
    const username = `dashboard-${browserName}-${Date.now()}`;
    const created = await request.post('/api/admin/users', { headers: adminHeaders, data: { username, displayName: 'Dashboard E2E', password: AUTH_TEST_PASSWORD } });
    expect(created.status()).toBe(201);
    const { user } = await created.json() as { user: { id: string } };
    try {
      const response = await page.request.post('/auth/login', { headers: { Origin: origin }, data: { username, password: AUTH_TEST_PASSWORD } });
      expect(response.ok()).toBe(true);
      const session = await response.json() as AuthSession;
      await page.clock.setFixedTime(new Date('2026-11-04T08:00:00Z'));
      await page.addLocatorHandler(page.getByRole('complementary', { name: 'Trạng thái ứng dụng' }), async (notice) => {
        await notice.getByRole('button', { name: 'Đóng', exact: true }).click();
      });
      await use({ id: user.id, csrfToken: session.csrfToken });
    } finally {
      expect((await request.delete(`/api/admin/users/${user.id}`, { headers: adminHeaders })).status()).toBe(204);
    }
  }
});

test('dashboard shows real upcoming expenses and savings progress without posting transactions', async ({ page, dashboardUser }, testInfo) => {
  const ownerPath = `/api/users/${dashboardUser.id}`;
  const headers = { Origin: origin, 'X-CSRF-Token': dashboardUser.csrfToken };
  const cleanup: string[] = [];
  async function create(path: string, data: object, key: string) {
    const response = await page.request.post(`${ownerPath}/${path}`, { headers, data });
    expect(response.status()).toBe(201);
    const result = (await response.json())[key] as { id: string };
    cleanup.push(`${ownerPath}/${path}/${result.id}`);
    return result;
  }
  try {
    await page.goto('/dashboard');
    const bills = page.getByRole('region', { name: 'Hóa đơn sắp đến hạn', exact: true });
    const savings = page.getByRole('region', { name: 'Tiến độ tiết kiệm', exact: true });
    await expect(bills.getByText('Chưa có khoản chi định kỳ đang hoạt động.', { exact: false })).toBeVisible();
    await expect(savings.getByText('Chưa có mục tiêu đang thực hiện.', { exact: false })).toBeVisible();

    const before = await (await page.request.get(`${ownerPath}/summary`)).json();
    const wallet = await create('wallets', { name: 'Ví dashboard', type: 'CASH', openingBalance: 1000000, accountLabel: '', accountReference: '' }, 'wallet');
    const categories = await (await page.request.get(`${ownerPath}/categories`)).json() as { categories: Array<{ id: string; type: string }> };
    const goal = await create('savings-goals', { name: 'Du lịch dashboard', description: '', targetAmount: 2000000, dueDate: '2026-12-01' }, 'goal');
    expect((await page.request.post(`${ownerPath}/savings-goals/${goal.id}/contributions`, { headers, data: { amount: 500000, note: '' } })).status()).toBe(201);

    for (const [name, startDate, type, active] of [
      ['Internet dashboard', '2026-11-05', 'EXPENSE', true],
      ['Điện nước quá hạn', '2026-11-02', 'EXPENSE', true],
      ['Lương không phải hóa đơn', '2026-11-01', 'INCOME', true],
      ['Hóa đơn đã tạm dừng', '2026-11-01', 'EXPENSE', false]
    ] as const) {
      const schedule = await create('recurring-schedules', { name, startDate, type, amount: 250000, walletId: wallet.id, categoryId: categories.categories.find((item) => item.type === type)!.id, cadence: 'MONTHLY', intervalCount: 1, dayOfMonth: Number(startDate.slice(-2)), timezone: 'Asia/Bangkok', note: '' }, 'schedule');
      if (!active) expect((await page.request.patch(`${ownerPath}/recurring-schedules/${schedule.id}`, { headers, data: { isActive: false } })).ok()).toBe(true);
    }

    await page.reload();
    await expect(bills.getByText('Internet dashboard', { exact: true })).toBeVisible();
    await expect(bills.getByText(/Ngày mai/)).toBeVisible();
    await expect(bills.getByText(/Quá hạn 2 ngày/)).toBeVisible();
    await expect(bills.locator('li').first()).toContainText('Điện nước quá hạn');
    await expect(bills.locator('li')).toHaveCount(2);
    await expect(bills).not.toContainText('Lương không phải hóa đơn');
    await expect(bills).not.toContainText('Hóa đơn đã tạm dừng');
    await expect(savings.getByText('500.000 ₫ / 2.000.000 ₫', { exact: true })).toBeVisible();
    await expect(savings.getByRole('progressbar', { name: 'Tiến độ Du lịch dashboard' })).toHaveAttribute('value', '25');

    await savings.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('dashboard-plans.png'), fullPage: true });
    await page.getByRole('button', { name: 'Ẩn số dư', exact: true }).click();
    await expect(savings).not.toContainText('500.000');
    await expect(savings.getByRole('progressbar')).toHaveCount(0);
    await expect(bills).not.toContainText('250.000');
    await page.getByRole('button', { name: 'Hiện số dư', exact: true }).click();
    await expect(savings.getByText('25%', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const after = await (await page.request.get(`${ownerPath}/summary`)).json();
    expect(after.totalBalance).toBe(before.totalBalance + 1000000);
    expect(after.expenseThisMonth).toBe(before.expenseThisMonth);
    expect(after.incomeThisMonth).toBe(before.incomeThisMonth);
    await bills.getByRole('link', { name: 'Xem tất cả hóa đơn định kỳ' }).click();
    await expect(page).toHaveURL(/\/recurring$/);
    await page.goto('/dashboard');
    await savings.getByRole('link', { name: 'Xem tất cả mục tiêu tiết kiệm' }).click();
    await expect(page).toHaveURL(/\/savings$/);
  } finally {
    for (const path of cleanup.reverse()) expect((await page.request.delete(path, { headers })).status()).toBe(204);
  }
});

test('calendar tab fits a phone and groups real income/expenses by local day', async ({ page, dashboardUser }, testInfo) => {
  const path = `/api/users/${dashboardUser.id}`;
  const headers = { Origin: origin, 'X-CSRF-Token': dashboardUser.csrfToken };
  const response = await page.request.post(`${path}/wallets`, { headers, data: { name: 'Ví lịch tháng', type: 'CASH', openingBalance: 0, accountLabel: '', accountReference: '' } });
  expect(response.status()).toBe(201);
  const { wallet } = await response.json();
  const categories = (await (await page.request.get(`${path}/categories`)).json()).categories as Array<{ id: string; type: string }>;
  for (const [type, amount, occurredAt, deleted] of [
    ['INCOME', 1500000, '2026-11-03T17:10:00Z', false], // Nov 4 in Bangkok.
    ['EXPENSE', 100000, '2026-11-04T03:00:00Z', false],
    ['EXPENSE', 25000, '2026-11-04T04:00:00Z', false],
    ['EXPENSE', 999000, '2026-11-04T05:00:00Z', true],
    ['INCOME', 999999, '2026-10-31T10:00:00Z', false]
  ] as const) {
    const created = await page.request.post(`${path}/transactions`, { headers, data: { id: crypto.randomUUID(), type, amount, walletId: wallet.id, categoryId: categories.find(c => c.type === type)!.id, occurredAt, note: 'Lịch tháng thử nghiệm', tags: [] } });
    expect(created.status()).toBe(201);
    if (deleted) expect((await page.request.delete(`${path}/transactions/${(await created.json()).transaction.id}`, { headers })).status()).toBe(200);
  }
  await page.goto('/dashboard');
  await expect(page.getByRole('region', { name: 'Lịch thu chi', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Lịch', exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  const calendar = page.getByRole('table', { name: 'Thu chi từng ngày tháng 11 năm 2026' });
  const day = calendar.getByRole('button', { name: /Ngày 4 tháng 11 năm 2026:/ });
  await expect(day).toHaveAttribute('aria-label', /Thu 1\.500\.000.*Chi 125\.000/);
  await expect(day).toContainText('+1,5tr');
  await expect(day).toContainText('−125k');
  await expect(day).toHaveAttribute('aria-current', 'date');
  await expect(calendar.getByRole('button')).toHaveCount(30);
  await expect(calendar.getByRole('columnheader')).toHaveCount(7);
  await expect(calendar.getByRole('row').nth(1).getByRole('cell').last()).toContainText('1');
  await expect(page.getByRole('heading', { name: 'Chi tiêu nhanh', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Giao dịch gần đây', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  const fits = await page.evaluate(() => {
    const table = document.querySelector('.month-calendar table')!.getBoundingClientRect();
    const tabs = document.querySelector('.account-tabs')!.getBoundingClientRect();
    return table.bottom <= tabs.top;
  });
  expect(fits).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard-month-calendar-320.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.querySelector('.month-calendar table')!.getBoundingClientRect().bottom <= document.querySelector('.account-tabs')!.getBoundingClientRect().top)).toBe(true);
  await page.getByRole('button', { name: 'Ẩn số tiền', exact: true }).click();
  await expect(day).toHaveAttribute('aria-label', /Đã ẩn số tiền/);
  await expect(calendar).not.toContainText('1,5tr');
  await expect(day).toHaveAttribute('title', /Đã ẩn số tiền/);
  const details = page.getByRole('region', { name: 'Thu chi ngày 04/11/2026', exact: true });
  await expect(details).not.toContainText('1.500.000');
  await expect(details).not.toContainText('125.000');
  await page.getByRole('button', { name: 'Hiện số tiền', exact: true }).click();
  await page.waitForLoadState('networkidle');
  let transactionReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === `${path}/transactions` && request.method() === 'GET') transactionReads++; });
  await day.click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await expect(details.locator('.calendar-day-totals > div').first()).toContainText('1.500.000');
  await expect(details.locator('.calendar-day-totals > div').last()).toContainText('125.000');
  await expect(details.getByRole('listitem')).toHaveCount(3);
  await expect(details).not.toContainText('999.000');
  await expect(details).not.toContainText('999.999');
  await calendar.getByRole('button', { name: /Ngày 5 tháng 11 năm 2026:/ }).click();
  const emptyDay = page.getByRole('region', { name: 'Thu chi ngày 05/11/2026', exact: true });
  await expect(emptyDay).toContainText('Ngày này chưa có giao dịch thu chi.');
  await expect(emptyDay.getByRole('listitem')).toHaveCount(0);
  await day.click();
  await expect(details.getByRole('listitem')).toHaveCount(3);
  expect(transactionReads).toBe(0);
  await details.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('calendar-selected-day-details.png'), fullPage: true });
  await expect(page.getByText('Đơn vị VND', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Chạm ngày để xem thu chi bên dưới.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tháng trước', exact: true }).click();
  const october = page.getByRole('table', { name: 'Thu chi từng ngày tháng 10 năm 2026' });
  await expect(october.getByRole('button')).toHaveCount(31);
  await expect(october.locator('[aria-current="date"]')).toHaveCount(0);
  const octoberDay = october.getByRole('button', { name: /Ngày 31 tháng 10 năm 2026:/ });
  await expect(octoberDay).toHaveAttribute('aria-label', /Thu 999\.999/);
  await octoberDay.click();
  const octoberDetails = page.getByRole('region', { name: 'Thu chi ngày 31/10/2026', exact: true });
  await expect(octoberDetails.getByRole('listitem')).toHaveCount(1);
  await expect(octoberDetails).toContainText('999.999');
  await expect(octoberDetails).not.toContainText('1.500.000');
  await page.getByRole('button', { name: 'Tháng sau', exact: true }).click();
  await expect(day).toHaveAttribute('aria-current', 'date');
  await page.getByRole('button', { name: 'Tháng sau', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Thu chi từng ngày tháng 12 năm 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Tháng sau', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Thu chi từng ngày tháng 1 năm 2027' }).getByRole('button')).toHaveCount(31);
  await expect(page.getByRole('region', { name: 'Thu chi ngày 01/01/2027', exact: true })).toContainText('Ngày này chưa có giao dịch thu chi.');
  await page.getByRole('button', { name: 'Tháng trước', exact: true }).click();
  await page.getByRole('button', { name: 'Tháng trước', exact: true }).click();
  await expect(details.getByRole('listitem')).toHaveCount(3);
  expect(transactionReads).toBe(0);
});

test('a recurring API failure does not hide savings, and sync refreshes new contributions', async ({ page, dashboardUser }) => {
  const ownerPath = `/api/users/${dashboardUser.id}`;
  const headers = { Origin: origin, 'X-CSRF-Token': dashboardUser.csrfToken };
  const created = await page.request.post(`${ownerPath}/savings-goals`, { headers, data: { name: 'Quỹ dự phòng dashboard', description: '', targetAmount: 1000000, dueDate: null } });
  expect(created.status()).toBe(201);
  const { goal } = await created.json() as { goal: { id: string } };
  try {
    // Inject only the transport failure; goals and auth still use real APIs.
    await page.route(`**${ownerPath}/recurring-schedules`, (route) => route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Unavailable' } } }));
    await page.goto('/dashboard');
    const bills = page.getByRole('region', { name: 'Hóa đơn sắp đến hạn', exact: true });
    const savings = page.getByRole('region', { name: 'Tiến độ tiết kiệm', exact: true });
    await expect(bills.getByText(/Chưa tải được hóa đơn/)).toBeVisible();
    await expect(savings.getByText('Quỹ dự phòng dashboard', { exact: true })).toBeVisible();
    await expect(savings.getByRole('progressbar')).toHaveAttribute('value', '0');
    const contribution = await page.request.post(`${ownerPath}/savings-goals/${goal.id}/contributions`, { headers, data: { amount: 250000, note: '' } });
    expect(contribution.status()).toBe(201);
    await page.evaluate(() => window.dispatchEvent(new Event('thu-chi-sync-change')));
    await expect(savings.getByRole('progressbar')).toHaveAttribute('value', '25');
  } finally {
    expect((await page.request.delete(`${ownerPath}/savings-goals/${goal.id}`, { headers })).status()).toBe(204);
  }
});
