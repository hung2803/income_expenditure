import { defineConfig, devices } from '@playwright/test';

const origin = process.env.PREVIEW_ORIGIN;
if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) {
  throw new Error('PREVIEW_ORIGIN must be an HTTPS origin without a trailing slash.');
}

export default defineConfig({
  testDir: './e2e/preview',
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: origin, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }
  ]
});
