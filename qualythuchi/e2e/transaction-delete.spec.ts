import { expect, test } from '@playwright/test';
import { AUTH_TEST_PASSWORD } from '../apps/backend/test/auth-fixtures';

test('expense deletion requires confirmation; cancel, failure, double click and undo are safe', async ({ page, request, context, browserName }, testInfo) => {
  const origin = 'http://127.0.0.1:4173';
  const login = await request.post('/auth/login', { headers: { Origin: origin }, data: { username: `e2e-${browserName}-admin`, password: AUTH_TEST_PASSWORD } });
  expect(login.ok()).toBe(true);
  const admin = await login.json();
  const adminHeaders = { Origin: origin, 'X-CSRF-Token': admin.csrfToken as string };
  const username = `confirm-delete-${browserName}-${Date.now()}`;
  const created = await request.post('/api/admin/users', { headers: adminHeaders, data: { username, displayName: 'Delete confirmation test', password: AUTH_TEST_PASSWORD } });
  expect(created.status()).toBe(201);
  const { user } = await created.json();
  try {
    const signedIn = await page.request.post('/auth/login', { headers: { Origin: origin }, data: { username, password: AUTH_TEST_PASSWORD } });
    expect(signedIn.ok()).toBe(true);
    const session = await signedIn.json();
    const headers = { Origin: origin, 'X-CSRF-Token': session.csrfToken as string };
    const path = `/api/users/${user.id}`;
    const walletResponse = await page.request.post(`${path}/wallets`, { headers, data: { name: 'Ví kiểm tra xóa', type: 'CASH', openingBalance: 1000000, accountLabel: '', accountReference: '' } });
    expect(walletResponse.status()).toBe(201);
    const { wallet } = await walletResponse.json();
    const categories = (await (await page.request.get(`${path}/categories`)).json()).categories as Array<{ id: string; type: string }>;
    const note = 'Chi phí cần xác nhận';
    const transactionResponse = await page.request.post(`${path}/transactions`, { headers, data: { id: crypto.randomUUID(), type: 'EXPENSE', amount: 25000, categoryId: categories.find(c => c.type === 'EXPENSE')!.id, walletId: wallet.id, occurredAt: new Date().toISOString(), note, tags: [] } });
    expect(transactionResponse.status()).toBe(201);
    const { transaction } = await transactionResponse.json();
    const exists = async () => ((await (await page.request.get(`${path}/transactions`)).json()).transactions as Array<{ id: string }>).some(item => item.id === transaction.id);
    const balance = async () => (await (await page.request.get(`${path}/summary`)).json()).totalBalance as number;
    const outboxCount = (unsentOnly = false) => page.evaluate(async ({ id, unsentOnly }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => { const opened = indexedDB.open(`thu-chi:user:${encodeURIComponent(id)}:data`); opened.onsuccess = () => resolve(opened.result); opened.onerror = () => reject(opened.error); });
      try { return await new Promise<number>((resolve, reject) => { const items = database.transaction('outbox', 'readonly').objectStore('outbox').getAll(); items.onsuccess = () => resolve(items.result.filter((item: { status: string }) => !unsentOnly || item.status !== 'synced').length); items.onerror = () => reject(items.error); }); }
      finally { database.close(); }
    }, { id: user.id as string, unsentOnly });
    await page.addLocatorHandler(page.getByRole('complementary', { name: 'Trạng thái ứng dụng' }), async notice => { await notice.getByRole('button', { name: 'Đóng', exact: true }).click(); });
    await page.goto('/transactions');
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await balance()).toBe(975000);
    const remove = page.getByRole('button', { name: `Xóa giao dịch ${note}`, exact: true });
    const popup = page.getByRole('dialog', { name: 'Xóa khoản chi?', exact: true });
    await remove.click();
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('25.000');
    await expect(popup).toContainText(note);
    await expect(popup.getByRole('button', { name: 'Hủy', exact: true })).toBeFocused();
    expect(await popup.evaluate(element => { const rect = element.getBoundingClientRect(); return Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2 && Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 2; })).toBe(true);
    expect(await outboxCount()).toBe(0); expect(await exists()).toBe(true);
    await popup.getByRole('button', { name: 'Hủy', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await remove.click(); await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    expect(await outboxCount()).toBe(0); expect(await balance()).toBe(975000);

    // Fail one browser storage write before it can enqueue or change money.
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (stores, mode, options) {
        if (mode === 'readwrite' && Array.isArray(stores) && stores.includes('outbox') && stores.includes('records')) {
          IDBDatabase.prototype.transaction = original;
          throw new DOMException('Test-only write failure', 'QuotaExceededError');
        }
        return original.call(this, stores, mode, options);
      };
    });
    await remove.click();
    await popup.getByRole('button', { name: 'Xóa khoản chi', exact: true }).click();
    await expect(popup.getByRole('alert')).toContainText('Không xóa được');
    expect(await exists()).toBe(true); expect(await outboxCount()).toBe(0); expect(await balance()).toBe(975000);
    await page.screenshot({ path: testInfo.outputPath('delete-confirmation-error.png') });
    let pushes = 0;
    page.on('request', call => { if (call.url().endsWith(`${path}/sync/push`) && call.method() === 'POST') pushes++; });
    await popup.getByRole('button', { name: 'Xóa khoản chi', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(popup).toHaveCount(0);
    await expect(page.getByText(note, { exact: true })).toHaveCount(0);
    await expect.poll(exists).toBe(false);
    expect(await balance()).toBe(1000000); expect(await outboxCount()).toBe(1); expect(pushes).toBe(1);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await expect.poll(exists).toBe(true);
    expect(await balance()).toBe(975000);
    await page.waitForLoadState('networkidle');
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await remove.click();
    await popup.getByRole('button', { name: 'Xóa khoản chi', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    expect(await outboxCount(true)).toBe(2);
    await context.setOffline(false);
    await expect.poll(() => outboxCount(true)).toBe(0);
    expect(await exists()).toBe(true); expect(await balance()).toBe(975000); expect(pushes).toBe(4);
  } finally { expect((await request.delete(`/api/admin/users/${user.id}`, { headers: adminHeaders })).status()).toBe(204); }
});
