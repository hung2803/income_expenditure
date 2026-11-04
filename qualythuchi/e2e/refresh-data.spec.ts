import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { AUTH_TEST_PASSWORD } from '../apps/backend/test/auth-fixtures';

const origin = 'http://127.0.0.1:4173';
const test = base.extend<{ owner: { path: string; headers: Record<string, string> } }>({
  owner: async ({ page, request, browserName }, use) => {
    const login = await request.post('/auth/login', { headers: { Origin: origin }, data: { username: `e2e-${browserName}-admin`, password: AUTH_TEST_PASSWORD } });
    expect(login.ok()).toBe(true);
    const admin = await login.json();
    const headers = { Origin: origin, 'X-CSRF-Token': admin.csrfToken as string };
    const username = `refresh-${browserName}-${Date.now()}`;
    const created = await request.post('/api/admin/users', { headers, data: { username, displayName: 'Refresh User', password: AUTH_TEST_PASSWORD } });
    expect(created.status()).toBe(201);
    const { user } = await created.json();
    try {
      const response = await page.request.post('/auth/login', { headers: { Origin: origin }, data: { username, password: AUTH_TEST_PASSWORD } });
      expect(response.ok()).toBe(true);
      const session = await response.json();
      await page.addLocatorHandler(page.getByRole('complementary', { name: 'Trạng thái ứng dụng' }), async notice => { await notice.getByRole('button', { name: 'Đóng', exact: true }).click(); });
      await use({ path: `/api/users/${user.id}`, headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken as string } });
    } finally { expect((await request.delete(`/api/admin/users/${user.id}`, { headers })).status()).toBe(204); }
  }
});

async function pull(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    const dispatch = (type: string, touches: object[], changedTouches = touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
      document.body.dispatchEvent(event);
    };
    const start = { identifier: 1, clientX: 150, clientY: 100 };
    const end = { ...start, clientY: 280 };
    dispatch('touchstart', [start]); dispatch('touchmove', [end]); dispatch('touchend', [], [end]);
  });
}

test('refresh gets real new data once, preserves content and scroll while pending, and never navigates', async ({ page, owner }, testInfo) => {
  const created = await page.request.post(`${owner.path}/wallets`, { headers: owner.headers, data: { name: 'Ví trước làm mới', type: 'CASH', openingBalance: 100000, accountLabel: '', accountReference: '' } });
  expect(created.status()).toBe(201);
  const { wallet } = await created.json();
  try {
    await page.goto('/wallets');
    await expect(page.getByText('Ví trước làm mới', { exact: true })).toBeVisible();
    expect((await page.request.put(`${owner.path}/wallets/${wallet.id}`, { headers: owner.headers, data: { name: 'Ví sau làm mới', type: 'CASH', openingBalance: 100000, accountLabel: '', accountReference: '' } })).ok()).toBe(true);
    let gets = 0; let navigations = 0;
    page.on('request', request => { if (request.isNavigationRequest()) navigations++; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${owner.path}/wallets`, async route => {
      gets++; const response = await route.fetch(); await gate; await route.fulfill({ response });
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await pull(page);
    await expect(page.locator('.pull-refresh-refreshing')).toBeVisible();
    await expect(page.getByText('Ví trước làm mới', { exact: true })).toBeVisible();
    await pull(page);
    expect(gets).toBeLessThanOrEqual(1);
    await page.evaluate(() => { const space = document.createElement('div'); space.style.height = '2000px'; document.body.appendChild(space); window.scrollTo(0, 120); });
    await page.waitForFunction(() => window.scrollY === 120);
    await page.screenshot({ path: testInfo.outputPath('refresh-keeps-content.png') });
    release();
    await expect(page.locator('.pull-refresh-done')).toContainText('Đã làm mới');
    await expect(page.getByText('Ví sau làm mới', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(120);
    expect(gets).toBe(1); expect(navigations).toBe(0);
  } finally { expect((await page.request.delete(`${owner.path}/wallets/${wallet.id}`, { headers: owner.headers })).status()).toBe(204); }
});

test('refresh preserves applied filters and unsent search drafts; offline and API failures keep content', async ({ page, context, owner }) => {
  await page.goto('/search?type=EXPENSE');
  await expect(page.getByRole('heading', { name: 'Tìm kiếm nâng cao' })).toBeVisible();
  await page.getByLabel('Từ khóa', { exact: true }).fill('nội dung chưa tìm');
  await page.getByLabel('Nhãn', { exact: true }).fill('bản nháp');
  await page.getByLabel('Nhãn', { exact: true }).blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const url = page.url();
  let query = ''; let requests = 0;
  await page.route(`**${owner.path}/transactions/search?**`, async route => {
    requests++; query = route.request().url(); await route.continue();
  });
  await pull(page);
  await expect(page.locator('.pull-refresh-done')).toBeVisible();
  expect(requests).toBe(1); expect(new URL(query).searchParams.get('type')).toBe('EXPENSE');
  expect(new URL(query).searchParams.has('keyword')).toBe(false);
  await expect(page.getByLabel('Từ khóa', { exact: true })).toHaveValue('nội dung chưa tìm');
  await expect(page.getByLabel('Nhãn', { exact: true })).toHaveValue('bản nháp');
  expect(page.url()).toBe(url);
  await context.setOffline(true);
  await pull(page);
  await expect(page.locator('.pull-refresh-error')).toContainText('offline');
  expect(requests).toBe(1);
  await context.setOffline(false);
  await page.unroute(`**${owner.path}/transactions/search?**`);
  await page.route(`**${owner.path}/transactions/search?**`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await pull(page);
  await expect(page.locator('.pull-refresh-error')).toContainText('giữ lại');
  await expect(page.getByLabel('Từ khóa', { exact: true })).toHaveValue('nội dung chưa tìm');
  expect(page.url()).toBe(url);
});

test('recurring draft changes do not refetch, and refresh keeps draft fields', async ({ page, owner }) => {
  await page.goto('/recurring');
  await expect(page.getByRole('heading', { name: 'Giao dịch định kỳ', exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  let requests = 0;
  page.on('request', request => { if (request.url().includes(`${owner.path}/`) && request.method() === 'GET') requests++; });
  await page.getByLabel('Tên khoản', { exact: true }).fill('Internet bản nháp');
  await page.getByRole('combobox', { name: 'Loại', exact: true }).selectOption('INCOME');
  await page.waitForTimeout(150);
  expect(requests).toBe(0);
  await page.getByLabel('Tên khoản', { exact: true }).blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await pull(page);
  await expect(page.locator('.pull-refresh-done')).toBeVisible();
  await expect(page.getByLabel('Tên khoản', { exact: true })).toHaveValue('Internet bản nháp');
  await expect(page.getByRole('combobox', { name: 'Loại', exact: true })).toHaveValue('INCOME');
  expect(requests).toBe(3);
});

test('changing report filters cancels old requests and late responses cannot overwrite newer data', async ({ page, owner }) => {
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Báo cáo thống kê', exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  let first = true; let release!: () => void; let oldRequested!: () => void;
  const oldStarted = new Promise<void>(resolve => { oldRequested = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  await page.route(`**${owner.path}/reports/summary?**`, async route => {
    requests.push(route.request().url());
    const response = await route.fetch();
    const payload = await response.json();
    const old = first;
    payload.totals.income = old ? 111111 : 222222;
    if (old) { first = false; oldRequested(); await gate; }
    await route.fulfill({ response, json: payload }).catch(() => undefined);
  });
  await page.getByRole('tab', { name: 'Tháng trước', exact: true }).click();
  await oldStarted;
  await page.getByRole('tab', { name: 'Năm nay', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Năm nay', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.reports-totals')).toBeVisible();
  await expect(page.locator('.reports-totals article').first()).toContainText('222.222');
  release();
  await page.waitForTimeout(150);
  expect(requests.length).toBe(2);
  await expect(page.locator('.reports-totals article').first()).toContainText('222.222');
  await expect(page.getByLabel('Từ', { exact: true })).toHaveValue(`${new Date().getFullYear()}-01-01`);
});

test('refresh preserves unsent transaction edits and deletions without changing the server ledger', async ({ page, owner }) => {
  const created = await page.request.post(`${owner.path}/wallets`, { headers: owner.headers, data: { name: 'Ví outbox thử nghiệm', type: 'CASH', openingBalance: 0, accountLabel: '', accountReference: '' } });
  expect(created.status()).toBe(201);
  const { wallet } = await created.json();
  const categories = await (await page.request.get(`${owner.path}/categories`)).json();
  const transactions = [];
  for (const note of ['bản máy chủ cũ', 'khoản đã xóa trên thiết bị']) {
    const response = await page.request.post(`${owner.path}/transactions`, { headers: owner.headers, data: { id: crypto.randomUUID(), type: 'EXPENSE', amount: 10000, walletId: wallet.id, categoryId: categories.categories.find((c: { type: string }) => c.type === 'EXPENSE').id, occurredAt: new Date().toISOString(), note, tags: [] } });
    expect(response.status()).toBe(201); transactions.push((await response.json()).transaction);
  }
  await page.goto('/transactions');
  await expect(page.getByText('bản máy chủ cũ', { exact: true })).toBeVisible();
  await page.route('**/sync/push', route => route.abort());
  await page.evaluate(async ({ transactions, ownerId }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(`thu-chi:user:${encodeURIComponent(ownerId)}:data`);
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    const transaction = database.transaction(['records', 'outbox'], 'readwrite');
    transactions.forEach((item, index) => {
      const value = { ...item, note: index ? item.note : 'bản sửa chưa đồng bộ', amount: index ? item.amount : 99999 };
      transaction.objectStore('records').put({ key: `transactions:${item.id}`, ownerUserId: ownerId, entity: 'transactions', id: item.id, value, updatedAt: Date.now(), deleted: index === 1 });
      transaction.objectStore('outbox').put({ id: `pending-${item.id}`, ownerUserId: ownerId, entity: 'transactions', operation: index ? 'delete' : 'update', recordId: item.id, payload: value, status: 'pending', attempts: 0, createdAt: Date.now(), updatedAt: Date.now() });
    });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    database.close();
  }, { transactions, ownerId: owner.path.split('/').at(-1)! });
  await page.evaluate(() => window.scrollTo(0, 0));
  await pull(page);
  await expect(page.locator('.pull-refresh-done')).toBeVisible();
  await expect(page.getByText('bản sửa chưa đồng bộ', { exact: true })).toBeVisible();
  await expect(page.getByText('khoản đã xóa trên thiết bị', { exact: true })).toHaveCount(0);
  const after = await (await page.request.get(`${owner.path}/transactions`)).json();
  expect(after.transactions.map((item: { amount: number }) => item.amount)).toEqual([10000, 10000]);
});

test('all personal data screens refresh without navigation or runtime errors', async ({ page, owner }) => {
  expect(owner.path).toContain('/api/users/');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/dashboard', '/calendar', '/wallets', '/categories', '/transactions', '/transfers', '/budgets', '/search', '/reports', '/savings', '/recurring', '/notifications', '/account', '/sync']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.scrollTo(0, 0));
    const navigation = await page.evaluate(() => performance.timeOrigin);
    await pull(page);
    await expect(page.locator('.pull-refresh-done'), path).toBeVisible();
    expect(await page.evaluate(() => performance.timeOrigin), path).toBe(navigation);
  }
  expect(errors).toEqual([]);
});
