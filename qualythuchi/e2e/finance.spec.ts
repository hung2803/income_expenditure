import { expect, test } from '@playwright/test';
import type { AuthSession } from '@thu-chi/contracts';

const session: AuthSession = {
  user: { id: 'p02-finance-user', username: 'finance-user', displayName: 'Nguyễn An', role: 'USER' },
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  csrfToken: 'p02-csrf'
};

test.beforeEach(async ({ context }) => {
  await context.route('**/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/me') return route.fulfill({ status: 200, json: session, headers: { 'Cache-Control': 'no-store' } });
    return route.fulfill({ status: 404, json: {}, headers: { 'Cache-Control': 'no-store' } });
  });
});

test('wallet CRUD stores a negative whole-VND opening balance per account', async ({ page }) => {
  await page.goto('/wallets');
  await expect(page.getByRole('heading', { name: 'Quản lý ví' })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm ví đầu tiên' }).click();
  await page.getByLabel('Tên ví').fill('Ví thử nghiệm');
  await page.getByRole('button', { name: 'Loại ví' }).click();
  await page.getByRole('option', { name: 'Ngân hàng' }).click();
  await page.getByLabel('Số dư ban đầu (VND)').fill('-125000');
  await page.getByRole('button', { name: 'Lưu ví' }).click();
  await expect(page.getByText('-125.000 ₫')).toBeVisible();
  await expect(page.getByText('0 ₫').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ví thử nghiệm')).toBeVisible();
  await page.getByRole('button', { name: 'Sửa ví Ví thử nghiệm' }).click();
  await page.getByLabel('Số dư ban đầu (VND)').fill('2750000');
  await page.getByRole('button', { name: 'Lưu ví' }).click();
  await expect(page.getByText('2.750.000 ₫')).toBeVisible();
});

test('expense and income categories can be created, edited and deleted independently', async ({ page }) => {
  await page.goto('/categories');
  await expect(page.getByRole('tab', { name: 'Danh mục chi' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Thêm danh mục' }).click();
  await page.getByLabel('Tên danh mục').fill('Du lịch');
  await page.getByRole('button', { name: 'Lưu danh mục' }).click();
  await expect(page.getByText('Du lịch')).toBeVisible();
  await page.getByRole('button', { name: 'Sửa danh mục Du lịch' }).click();
  await page.getByLabel('Tên danh mục').fill('Du lịch và nghỉ dưỡng');
  await page.getByRole('button', { name: 'Lưu danh mục' }).click();
  await expect(page.getByText('Du lịch và nghỉ dưỡng')).toBeVisible();

  await page.getByRole('tab', { name: 'Danh mục thu' }).click();
  await expect(page.getByText('Lương')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm danh mục' }).click();
  await page.getByLabel('Tên danh mục').fill('Thu nhập khác');
  await page.getByRole('button', { name: 'Lưu danh mục' }).click();
  await expect(page.getByText('Thu nhập khác')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Xóa danh mục Thu nhập khác' }).click();
  await expect(page.getByText('Thu nhập khác')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Danh mục chi' }).click();
  await expect(page.getByText('Du lịch và nghỉ dưỡng')).toBeVisible();
});
