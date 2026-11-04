// Used only by local E2E setup. Never seed these accounts in dev or remote D1.
export const AUTH_TEST_PASSWORD = 'local-e2e-only-password!';
export const AUTH_TEST_ACCOUNTS = ['chromium', 'webkit'].flatMap((browser) => [
  { id: `e2e-${browser}-user`, username: `e2e-${browser}-user`, displayName: `E2E ${browser} User`, role: 'USER' },
  { id: `e2e-${browser}-admin`, username: `e2e-${browser}-admin`, displayName: `E2E ${browser} Admin`, role: 'SUPER_ADMIN' }
]);
