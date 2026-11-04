// Check real dev metadata and SPA tab navigation. Browser automation cannot
// assert the native Safari toolbars of an installed iPhone Home Screen app.
import { chromium, webkit, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const origin = process.env.LOCAL_DEV_ORIGIN ?? 'http://127.0.0.1:5173';
if (!process.env.LOCAL_DEV_USERNAME || !process.env.LOCAL_DEV_PASSWORD) throw new Error('Supply local credentials in memory for explicit read-only verification.');
const results = [];
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(30_000);
  let session;
  try {
    const health = await page.request.get(`${origin}/api/health`);
    expect(health.ok()).toBe(true); expect((await health.json()).environment).toBe('dev');
    const login = await page.request.post(`${origin}/auth/login`, { headers: { Origin: origin }, data: {
      username: process.env.LOCAL_DEV_USERNAME, password: process.env.LOCAL_DEV_PASSWORD
    } });
    expect(login.ok()).toBe(true); session = await login.json();
    await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifestUrl = new URL(manifestHref, origin);
    const response = await page.request.get(manifestUrl.href);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json();
    expect(manifest.display).toBe('standalone'); expect(manifest.scope).toBe('/'); expect(manifest.start_url).toBe('/');
    const scope = new URL(manifest.scope, manifestUrl);
    const started = await page.evaluate(() => globalThis.performance.timeOrigin);
    let popups = 0; let navigations = 0;
    const errors = [];
    page.on('popup', () => popups++);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++; });
    const checked = [];
    for (const [label, path] of [['Thu chi', '/transactions'], ['Lịch', '/calendar'], ['Báo cáo', '/reports'], ['Ngân sách', '/budgets'], ['Khác', '/more'], ['Trang chủ', '/dashboard']]) {
      const link = page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: label, exact: true });
      const href = new URL(await link.getAttribute('href'), origin);
      expect(href.origin).toBe(scope.origin); expect(href.pathname.startsWith(scope.pathname)).toBe(true);
      await link.click();
      await expect(page).toHaveURL(`${origin}${path}`);
      await expect(link).toHaveAttribute('aria-current', 'page');
      expect(await page.evaluate(() => globalThis.performance.timeOrigin)).toBe(started);
      checked.push(path);
    }
    expect(popups).toBe(0); expect(navigations).toBe(0); expect(errors).toEqual([]);
    expect(await page.evaluate(async () => (await globalThis.navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    results.push({ browser: name, checked, manifestScope: manifest.scope, display: manifest.display, newDocuments: navigations, popups, cachingWorkerRegistered: false, nativeSafariUiTested: false });
  } finally {
    if (session) await page.request.post(`${origin}/auth/logout`, { headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken }, data: {} }).catch(() => undefined);
    await browser.close();
  }
}
const directory = new URL('../.preview/e2e/pwa-navigation/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('result.json', directory), JSON.stringify({ origin, results }, null, 2));
console.log(JSON.stringify({ origin, results }, null, 2));
