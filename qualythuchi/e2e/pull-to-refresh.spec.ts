import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type Point = { identifier: number; clientX: number; clientY: number };
async function touch(page: Page, type: string, touches: Point[], changedTouches = touches, selector = 'body') {
  return page.evaluate(({ type, touches, changedTouches, selector }) => {
    const target = document.querySelector(selector)!;
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, touches, changedTouches, selector });
}
const point = (clientX: number, clientY: number, identifier = 1): Point => ({ identifier, clientX, clientY });

test.beforeEach(async ({ page }) => {
  await page.goto('/login?pull-refresh=1');
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeEnabled();
});

test('pulling down refreshes in place without reloading or clearing login drafts', async ({ page, context, browserName }, testInfo) => {
  let navigations = 0;
  page.on('request', (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++; });
  const originalUrl = page.url();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('draft-user');
  await page.getByLabel('Tên đăng nhập', { exact: true }).blur();
  if (browserName === 'chromium') {
    // Real browser touch input, not a DOM dispatch, also exercises passive
    // listeners and the interaction with native scrolling/overscroll.
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y: 100 }] });
      for (const y of [125, 150, 185, 220, 260]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 170, y }] });
      }
      await expect(page.getByRole('status').filter({ hasText: 'Thả để làm mới' })).toBeVisible();
      expect(navigations).toBe(0);
      await page.screenshot({ path: testInfo.outputPath('pull-ready.png') });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    // WebKit has no Chromium Input CDP domain. Exercise the same DOM handlers;
    // physical iPhone touch/overscroll remains part of device acceptance.
    await touch(page, 'touchstart', [point(170, 100)]);
    await touch(page, 'touchmove', [point(170, 140)]);
    await expect(page.getByRole('status').filter({ hasText: 'Kéo để làm mới' })).toBeVisible();
    expect(await touch(page, 'touchmove', [point(170, 260)])).toBe(true);
    await expect(page.getByRole('status').filter({ hasText: 'Thả để làm mới' })).toBeVisible();
    expect(navigations).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('pull-ready.png') });
    await touch(page, 'touchend', [], [point(170, 260)]);
    await touch(page, 'touchend', [], [point(170, 260)]);
  }
  await expect(page.locator('.pull-refresh-indicator')).toContainText('Đã làm mới');
  expect(navigations).toBe(0);
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toHaveValue('draft-user');
  expect(await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type)).not.toBe('reload');
});

test('short, horizontal, reversed, cancelled and multi-touch gestures do not reload', async ({ page }) => {
  let navigations = 0;
  page.on('request', (request) => { if (request.isNavigationRequest()) navigations++; });
  await touch(page, 'touchstart', [point(100, 100)]);
  await touch(page, 'touchmove', [point(100, 160)]);
  await touch(page, 'touchend', [], [point(100, 160)]);

  await touch(page, 'touchstart', [point(100, 100)]);
  expect(await touch(page, 'touchmove', [point(260, 150)])).toBe(false);
  await touch(page, 'touchend', [], [point(260, 150)]);

  await touch(page, 'touchstart', [point(100, 100)]);
  await touch(page, 'touchmove', [point(100, 260)]);
  await touch(page, 'touchmove', [point(100, 150)]);
  await touch(page, 'touchend', [], [point(100, 150)]);

  await touch(page, 'touchstart', [point(100, 100)]);
  await touch(page, 'touchmove', [point(100, 260)]);
  await touch(page, 'touchcancel', [], [point(100, 260)]);

  await touch(page, 'touchstart', [point(100, 100)]);
  expect(await touch(page, 'touchmove', [point(100, 260), point(150, 260, 2)])).toBe(false);
  await touch(page, 'touchend', [], [point(100, 260)]);
  await expect(page.locator('.pull-refresh-indicator')).not.toBeVisible();
  // Observe beyond the reload timer; a wrongly armed timer would navigate.
  await page.waitForTimeout(350);
  expect(navigations).toBe(0);
});

test('does not take over page scrolling, nested scroll areas, focused inputs or dialogs', async ({ page }) => {
  let navigations = 0;
  page.on('request', (request) => { if (request.isNavigationRequest()) navigations++; });
  await page.evaluate(() => {
    const space = document.createElement('div');
    space.id = 'scroll-space'; space.style.height = '2000px'; document.body.appendChild(space);
    const nested = document.createElement('div');
    nested.id = 'nested-scroll'; nested.style.cssText = 'height:80px;overflow-y:auto';
    const content = document.createElement('div'); content.style.height = '400px'; nested.appendChild(content); document.body.appendChild(nested);
    window.scrollTo(0, 300);
  });
  await page.waitForFunction(() => window.scrollY > 200);
  await touch(page, 'touchstart', [point(100, 100)]);
  expect(await touch(page, 'touchmove', [point(100, 300)])).toBe(false);
  await touch(page, 'touchend', [], [point(100, 300)]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => window.scrollY === 0);

  await touch(page, 'touchstart', [point(100, 100)], undefined, '#nested-scroll');
  expect(await touch(page, 'touchmove', [point(100, 300)], undefined, '#nested-scroll')).toBe(false);
  await touch(page, 'touchend', [], [point(100, 300)], '#nested-scroll');

  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('draft-user');
  await touch(page, 'touchstart', [point(100, 100)]);
  expect(await touch(page, 'touchmove', [point(100, 300)])).toBe(false);
  await touch(page, 'touchend', [], [point(100, 300)]);
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toHaveValue('draft-user');
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); const dialog = document.createElement('dialog'); dialog.textContent = 'Modal'; document.body.appendChild(dialog); dialog.showModal(); });
  await touch(page, 'touchstart', [point(100, 100)]);
  expect(await touch(page, 'touchmove', [point(100, 300)])).toBe(false);
  await touch(page, 'touchend', [], [point(100, 300)]);
  await expect(page.locator('.pull-refresh-indicator')).not.toBeVisible();
  await page.waitForTimeout(350);
  expect(navigations).toBe(0);
});
