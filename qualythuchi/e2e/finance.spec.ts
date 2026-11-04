import { expect, test } from '@playwright/test';
import { AUTH_TEST_ACCOUNTS, AUTH_TEST_PASSWORD } from '../apps/backend/test/auth-fixtures';

// Browser -> preview proxy -> actual Workers/D1 test database, including login.
test.beforeEach(async ({ page, browserName }) => {
  const account = AUTH_TEST_ACCOUNTS.find((item) => item.id === `e2e-${browserName}-user`)!;
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(account.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(AUTH_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('wallet CRUD stores a negative whole-VND opening balance per account', async ({ page }) => {
  const name = `Ví E2E ${Date.now().toString(36)}`;
  await page.goto('/wallets');
  await expect(page.getByRole('heading', { name: 'Quản lý ví' })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm ví', exact: true }).click();
  await page.getByLabel('Tên ví').fill(name);
  await page.getByRole('button', { name: 'Loại ví' }).click();
  await page.getByRole('option', { name: 'Ngân hàng' }).click();
  await page.getByLabel('Số dư ban đầu').fill('-125000');
  await page.getByRole('button', { name: 'Lưu ví' }).click();
  const wallet = page.locator('article.wallet-row').filter({ hasText: name });
  await expect(wallet.locator('.wallet-row-balance')).toHaveText('-125.000 ₫');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('0 ₫').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Sửa ví ${name}`, exact: true }).click();
  await page.getByLabel('Số dư ban đầu').fill('2750000');
  await page.getByRole('button', { name: 'Lưu ví' }).click();
  await expect(wallet.locator('.wallet-row-balance')).toHaveText('2.750.000 ₫');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(wallet.locator('.wallet-row-balance')).toHaveText('2.750.000 ₫');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Xóa ví ${name}`, exact: true }).click();
  await expect(wallet).toHaveCount(0);
});

test('expense and income categories can be created, edited and deleted independently', async ({ page }) => {
  const suffix = Date.now().toString(36);
  const expenseName = `Du lịch ${suffix}`;
  const editedName = `Nghỉ dưỡng ${suffix}`;
  const incomeName = `Thu khác ${suffix}`;
  await page.goto('/categories');
  await expect(page.getByRole('tab', { name: 'Danh mục chi' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Thêm danh mục' }).click();
  await page.getByLabel('Tên danh mục').fill(expenseName);
  await page.getByRole('button', { name: 'Lưu danh mục' }).click();
  await expect(page.getByText(expenseName, { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: `Sửa danh mục ${expenseName}`, exact: true }).click();
  await page.getByLabel('Tên danh mục').fill(editedName);
  await page.getByRole('button', { name: 'Lưu danh mục' }).click();
  await expect(page.getByText(editedName, { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  await page.getByRole('tab', { name: 'Danh mục thu' }).click();
  await expect(page.getByText('Lương')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm danh mục' }).click();
  await page.getByLabel('Tên danh mục').fill(incomeName);
  await page.getByRole('button', { name: 'Lưu danh mục' }).click();
  await expect(page.getByText(incomeName, { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Xóa danh mục ${incomeName}`, exact: true }).click();
  await expect(page.getByText(incomeName, { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Danh mục chi' }).click();
  await expect(page.getByText(editedName, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(editedName, { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Xóa danh mục ${editedName}`, exact: true }).click();
  await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);
});
