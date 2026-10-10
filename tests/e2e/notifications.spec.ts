import { test, expect } from '@playwright/test';
import { notificationCity } from '../fixtures/notificationCity';
test('city notifications focus real fire locations, expire and do not repeat while paused', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const fixture = await notificationCity(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low&debug=1');
  await expect(page.locator('.main-menu')).toBeVisible();
  await page.evaluate(async (f) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('webcity-saves', 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['slots', 'data'], 'readwrite');
      tx.objectStore('slots').put({
        id: '0',
        settings: f.settings,
        population: f.population,
        day: f.day,
        savedAt: 1,
        thumbnail: null,
      });
      tx.objectStore('data').put(new Uint8Array(f.data).buffer, '0');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, fixture);
  await page.reload();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]');

  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  const cards = page.locator('.city-notice');
  await expect(page.locator('.city-notice[data-code="fire"]')).toBeVisible();
  await expect(cards).toHaveCount(3);
  await page.screenshot({
    path: `docs/screenshots/m2-23/${name}.png`,
    scale: 'css',
  });
  const pos = await page.evaluate(
    () => window.__webcityBuildings!().find((b) => b.fire?.burning)!.pos,
  );
  await page.locator('.city-notice[data-code="fire"] .notice-message').click();
  await page.waitForFunction((p) => {
    const c = window.__webcityCamera!.readState();
    return (
      Math.abs(c.x - p.x) < 0.1 &&
      Math.abs(c.z - p.z) < 0.1 &&
      Math.abs(c.distance - 160) < 0.1
    );
  }, pos);
  await expect(page.locator('.city-notice[data-code="fire"]')).toHaveCount(0);
  await page.screenshot({
    path: `docs/screenshots/m2-23/${name}-focused.png`,
    scale: 'css',
  });
  if (name === 'iphone') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: 'docs/screenshots/m2-23/iphone-landscape.png',
      scale: 'css',
    });
  }
  await expect(cards).toHaveCount(0, { timeout: 6500 });
  await page.waitForTimeout(1000);
  await expect(cards).toHaveCount(0);
  expect(errors).toEqual([]);
});
