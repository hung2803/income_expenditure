import { expect, test } from '@playwright/test';
import { AUTH_TEST_ACCOUNTS, AUTH_TEST_PASSWORD } from '../apps/backend/test/auth-fixtures';

test('a resident passkey can be registered, listed, and used for login', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright exposes the virtual WebAuthn authenticator through Chromium CDP.');
  const account = AUTH_TEST_ACCOUNTS.find((item) => item.id === 'e2e-chromium-user')!;
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Tên đăng nhập').fill(account.username);
    await page.getByLabel('Mật khẩu').fill(AUTH_TEST_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/account');
    page.once('dialog', (dialog) => dialog.accept('E2E iPhone passkey'));
    await page.getByRole('button', { name: 'Thêm passkey trên thiết bị này' }).click();
    await expect(page.getByText('Đã thêm passkey cho tài khoản.')).toBeVisible();
    await expect(page.getByText('E2E iPhone passkey')).toBeVisible();

    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: 'Đăng nhập bằng Passkey' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: account.displayName, exact: true })).toBeVisible();
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await cdp.send('WebAuthn.disable');
    await cdp.detach();
  }
});
