import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/preview/**',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }
  ],
  webServer: [
    {
      command: 'npm run db:migrate:test -w @thu-chi/backend && npm run auth:seed:test -w @thu-chi/backend && npm run dev:test -w @thu-chi/backend',
      url: 'http://127.0.0.1:8788/api/health',
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: 'npm run preview -w @thu-chi/frontend -- --port 4173',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:8788' },
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false
    }
  ]
});
