import { test, expect } from '@playwright/test';
import { trafficCity } from '../fixtures/trafficCity';
test('follows a moving commuter smoothly and cancels on keyboard, touch and UI input', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await trafficCity();
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
  await page.waitForFunction(
    () => window.__webcityVehicles!.stats().agents >= 1000,
  );
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 650));
  await page.waitForFunction(
    () =>
      Math.abs(window.__webcityCamera!.readState().distance - 650) < 0.1 &&
      !window.__webcityRoadStats!().pending,
  );
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.waitForTimeout(600);
  const target = await page.evaluate(() => {
    const camera = window.__webcityCamera!.camera;
    return window
      .__webcityVehicles!.samples(1500)
      .filter((a) => a.kind === 0 && a.visible && a.speed > 0.5)
      .map((a) => {
        const p = camera.position
          .clone()
          .set(a.x, a.y + 0.8, a.z)
          .project(camera);
        return {
          id: a.id,
          citizen: a.citizenId,
          x: ((p.x + 1) * innerWidth) / 2,
          y: ((1 - p.y) * innerHeight) / 2,
        };
      })
      .filter((p) => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS')
      .sort(
        (a, b) =>
          Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) -
          Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2),
      )[0];
  });
  expect(target).toBeDefined();
  if (info.project.use.hasTouch)
    await page.touchscreen.tap(target!.x, target!.y);
  else await page.mouse.click(target!.x, target!.y);
  await expect(
    page.locator('.inspect-data[data-kind="vehicle"]'),
  ).toHaveAttribute('data-citizen', String(target!.citizen));
  const follow = page.getByRole('button', { name: '跟隨', exact: true });
  await follow.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m2-24/${name}-inspect.png`,
    scale: 'css',
  });
  await follow.click();
  await expect(page.locator('#app')).toHaveAttribute(
    'data-following',
    String(target!.id),
  );
  await expect(page.locator('.inspect-data')).toHaveCount(0);
  await page.waitForFunction((id) => {
    const v = window.__webcityVehicles!.samples(3000).find((v) => v.id === id),
      c = window.__webcityCamera!.readState();
    return (
      v &&
      Math.hypot(c.x - v.x, c.z - v.z) < 8 &&
      Math.abs(c.distance - 100) < 1
    );
  }, target!.id);
  const before = await page.evaluate(
    (id) => ({
      v: window.__webcityVehicles!.samples(3000).find((v) => v.id === id),
      c: window.__webcityCamera!.readState(),
    }),
    target!.id,
  );
  await page.waitForTimeout(1200);
  const after = await page.evaluate(
    (id) => ({
      v: window.__webcityVehicles!.samples(3000).find((v) => v.id === id),
      c: window.__webcityCamera!.readState(),
    }),
    target!.id,
  );
  expect(after.v).not.toBeNull();
  expect(
    Math.hypot(after.v!.x - before.v!.x, after.v!.z - before.v!.z),
  ).toBeGreaterThan(1);
  expect(
    Math.hypot(after.c.x - after.v!.x, after.c.z - after.v!.z),
  ).toBeLessThan(10);
  expect(
    Math.hypot(after.c.x - before.c.x, after.c.z - before.c.z),
  ).toBeGreaterThan(1);
  await page.screenshot({
    path: `docs/screenshots/m2-24/${name}-following.png`,
    scale: 'css',
  });
  if (name !== 'desktop')
    await page.getByRole('button', { name: '停止跟隨', exact: true }).click();
  if (name === 'iphone') {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(page.locator('#app')).toHaveAttribute(
      'data-following',
      'none',
    );
    await page.screenshot({
      path: 'docs/screenshots/m2-24/iphone-landscape.png',
      scale: 'css',
    });
  } else {
    await page.keyboard.press('Escape');
    await expect(page.locator('#app')).toHaveAttribute(
      'data-following',
      'none',
    );
  }
  const stopped = await page.evaluate(() =>
    window.__webcityCamera!.readState(),
  );
  await page.waitForTimeout(500);
  const stable = await page.evaluate(() => window.__webcityCamera!.readState());
  expect(Math.hypot(stable.x - stopped.x, stable.z - stopped.z)).toBeLessThan(
    0.1,
  );
  expect(errors).toEqual([]);
});
