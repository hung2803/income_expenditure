import { expect, test } from '@playwright/test';
import { AUTH_TEST_ACCOUNTS, AUTH_TEST_PASSWORD } from '../apps/backend/test/auth-fixtures';

test('a resident passkey can be registered, listed, and used for login', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright exposes the virtual WebAuthn authenticator through Chromium CDP.');
  const account = AUTH_TEST_ACCOUNTS.find((item) => item.id === 'e2e-chromium-user')!;
  const credentialName = `E2E passkey ${Date.now().toString(36)}`;
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
    // WebAuthn needs a hostname RP ID rather than an IP-address RP ID.
    await page.goto('http://localhost:4173/login');
    await page.getByLabel('Tên đăng nhập', { exact: true }).fill(account.username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(AUTH_TEST_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.addLocatorHandler(page.getByRole('complementary', { name: 'Trạng thái ứng dụng' }), async (notice) => {
      await notice.getByRole('button', { name: 'Đóng', exact: true }).click();
    });

    await page.goto('http://localhost:4173/account');
    page.once('dialog', (dialog) => dialog.accept(credentialName));
    await page.getByRole('button', { name: 'Thêm passkey trên thiết bị này' }).click();
    await expect(page.getByText('Đã thêm passkey cho tài khoản.')).toBeVisible();
    await expect(page.getByText(credentialName, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: 'Đăng nhập bằng Passkey' }).click();
    // Logging out from /account remembers that protected destination.
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('heading', { name: account.displayName, exact: true })).toBeVisible();
    const me = await page.request.get('http://localhost:4173/auth/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ user: { id: account.id } });
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: `Xóa ${credentialName}`, exact: true }).click();
    await expect(page.getByText(credentialName, { exact: true })).toHaveCount(0);
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await cdp.send('WebAuthn.disable');
    await cdp.detach();
  }
});
