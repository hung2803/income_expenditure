// Explicit local verification only. Temporarily changes two harmless UI/health
// markers and restores exact bytes in finally; never seeds or resets a database.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import process from 'node:process';
import { chromium, expect } from '@playwright/test';

const root = new URL('../', import.meta.url);
const webFile = new URL('apps/frontend/src/features/auth/LoginPage.tsx', root);
const apiFile = new URL('apps/backend/src/modules/health/routes.ts', root);
const webOriginal = readFileSync(webFile);
const apiOriginal = readFileSync(apiFile);
const webProbe = webOriginal.toString().replace('<h1>Đăng nhập</h1>', '<h1>Đăng nhập HMR probe</h1>');
const apiProbe = apiOriginal.toString().replace('  const result = await checkHealth(c.env);', "  c.header('X-Local-Hmr', 'probe');\n  const result = await checkHealth(c.env);");
if (webProbe === webOriginal.toString() || apiProbe === apiOriginal.toString()) throw new Error('Probe targets have changed; no files were edited.');
const browser = await chromium.launch();
const page = await browser.newPage();
const result = {};
try {
  await page.goto('http://127.0.0.1:5173/login');
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('hmr-draft');
  let navigations = 0;
  page.on('request', request => { if (request.isNavigationRequest()) navigations++; });
  let start = performance.now();
  writeFileSync(webFile, webProbe);
  await expect(page.getByRole('heading', { name: 'Đăng nhập HMR probe', exact: true })).toBeVisible({ timeout: 15_000 });
  result.frontendHmrMs = performance.now() - start;
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toHaveValue('hmr-draft');
  result.documentNavigationsDuringHmr = navigations;
  writeFileSync(webFile, webOriginal);
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
  start = performance.now();
  writeFileSync(apiFile, apiProbe);
  await expect.poll(async () => (await page.request.get('http://127.0.0.1:5173/api/health')).headers()['x-local-hmr'], { timeout: 20_000 }).toBe('probe');
  result.backendReloadMs = performance.now() - start;
  writeFileSync(apiFile, apiOriginal);
  await expect.poll(async () => (await page.request.get('http://127.0.0.1:5173/api/health')).headers()['x-local-hmr'], { timeout: 20_000 }).toBeUndefined();
  result.api = {};
  for (const origin of ['http://127.0.0.1:8787', 'http://127.0.0.1:5173']) {
    const times = [];
    for (let index = 0; index < 5; index++) {
      start = performance.now();
      const response = await page.request.get(`${origin}/api/health`);
      expect(response.ok()).toBe(true);
      const health = await response.json();
      expect(health.environment).toBe('dev'); expect(health.checks.database).toBe('ok');
      times.push(performance.now() - start);
    }
    result.api[origin] = times;
  }
  // Optional real local read verification, credentials supplied only in memory.
  if (process.env.LOCAL_DEV_USERNAME && process.env.LOCAL_DEV_PASSWORD) {
    const origin = 'http://127.0.0.1:5173';
    const login = await page.request.post(`${origin}/auth/login`, { headers: { Origin: origin }, data: { username: process.env.LOCAL_DEV_USERNAME, password: process.env.LOCAL_DEV_PASSWORD } });
    expect(login.ok()).toBe(true);
    const session = await login.json();
    try {
      const wallets = await page.request.get(`${origin}/api/users/${session.user.id}/wallets`);
      expect(wallets.ok()).toBe(true);
      result.localWalletCount = (await wallets.json()).wallets.length;
      await page.goto(`${origin}/dashboard`);
      await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
      result.authenticatedDashboard = true;
    } finally {
      expect((await page.request.post(`${origin}/auth/logout`, { headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken }, data: {} })).ok()).toBe(true);
    }
  }
  mkdirSync(new URL('.preview/performance/', root), { recursive: true });
  writeFileSync(new URL('.preview/performance/dev-verification.json', root), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (readFileSync(webFile).toString() === webProbe) writeFileSync(webFile, webOriginal);
  if (readFileSync(apiFile).toString() === apiProbe) writeFileSync(apiFile, apiOriginal);
  await browser.close();
}
