// Verify recovery from a stale app shell on the actual local/tunnel origin.
// Uses a separate browser context and a temporary worker; never clears app data.
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const origin = process.env.LOCAL_DEV_ORIGIN ?? 'http://127.0.0.1:5173';
if (!process.env.LOCAL_DEV_USERNAME || !process.env.LOCAL_DEV_PASSWORD) throw new Error('Supply local credentials in memory for this explicit verification.');
const root = new URL('../', import.meta.url);
const workerName = `dev-pwa-probe-${randomUUID()}.js`;
const workerFile = new URL(`apps/frontend/public/${workerName}`, root);
const oldHtml = '<!doctype html><html lang="vi"><meta charset="utf-8"><h1>Giao diện cũ kiểm tra</h1></html>';
const worker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && !new URL(event.request.url).pathname.startsWith('/auth/')) {
    event.respondWith(Promise.resolve(new Response(${JSON.stringify(oldHtml)}, {headers:{'Content-Type':'text/html'}})));
  }
});`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(30_000);
const marker = `thu-chi:dev-recovery-proof:${randomUUID()}`;
let session;
try {
  const health = await page.request.get(`${origin}/api/health`);
  expect(health.ok()).toBe(true);
  expect((await health.json()).environment).toBe('dev');
  const sw = await page.request.get(`${origin}/sw.js`);
  expect(sw.headers()['content-type']).toContain('application/javascript');
  expect(sw.headers()['cache-control']).toBe('no-store');
  const login = await page.request.post(`${origin}/auth/login`, { headers: { Origin: origin }, data: {
    username: process.env.LOCAL_DEV_USERNAME, password: process.env.LOCAL_DEV_PASSWORD
  } });
  expect(login.ok()).toBe(true); session = await login.json();
  await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Lịch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lịch thu chi', exact: true })).toBeVisible();
  const databaseName = `thu-chi:user:${encodeURIComponent(session.user.id)}:data`;
  await expect.poll(() => page.evaluate(async (name) => (await globalThis.indexedDB.databases()).some(db => db.name === name), databaseName)).toBe(true);
  await page.evaluate((key) => globalThis.localStorage.setItem(key, 'preserved'), marker);
  writeFileSync(workerFile, worker);
  await page.evaluate(async (name) => {
    await globalThis.navigator.serviceWorker.register(`/${name}`, { scope: '/' });
    await globalThis.navigator.serviceWorker.ready;
    if (!globalThis.navigator.serviceWorker.controller) await new Promise(resolve => {
      globalThis.navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
  }, workerName);
  await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Giao diện cũ kiểm tra', exact: true })).toBeVisible();
  await page.goto(`${origin}/auth/dev-refresh`, { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Lịch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lịch thu chi', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Chi tiêu nhanh', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Giao dịch gần đây', exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => globalThis.localStorage.getItem(key), marker)).toBe('preserved');
  expect(await page.evaluate(async (name) => (await globalThis.indexedDB.databases()).some(db => db.name === name), databaseName)).toBe(true);
  expect((await page.request.get(`${origin}/auth/me`)).ok()).toBe(true);
  expect(await page.evaluate(async () => (await globalThis.navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await page.getByRole('button', { name: 'Ẩn số tiền', exact: true }).click();
  const directory = new URL('.preview/e2e/pwa-dev-recovery/', root);
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('calendar-tunnel.png', directory)), fullPage: true });
  const result = { origin, calendarVisible: true, recoveredFromStaleWorker: true, sessionPreserved: true, localStoragePreserved: true, userDatabasePreserved: true, workerUnregistered: true };
  writeFileSync(new URL('result.json', directory), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await page.evaluate((key) => globalThis.localStorage.removeItem(key), marker).catch(() => undefined);
  if (session) await page.request.post(`${origin}/auth/logout`, { headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken }, data: {} }).catch(() => undefined);
  try { if (readFileSync(workerFile).toString() === worker) unlinkSync(workerFile); } catch { /* File was not created, or was changed outside this probe. */ }
  await browser.close();
}
