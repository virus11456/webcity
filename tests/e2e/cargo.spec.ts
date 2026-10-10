import { test, expect } from '@playwright/test';
import { cargoCity } from '../fixtures/cargoCity';
test('loads, inspects and delivers industrial goods with a real moving truck', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await cargoCity();
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
    () => window.__webcityVehicles!.stats().agents >= 1,
  );
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -220, z: 0 }, 180),
  );
  await page.waitForFunction(
    () =>
      Math.abs(window.__webcityCamera!.readState().distance - 180) < 0.1 &&
      !window.__webcityRoadStats!().pending,
  );

  const p = await page.evaluate((id) => {
    const a = window.__webcityVehicles!.samples(100).find((a) => a.id === id)!,
      c = window.__webcityCamera!.camera,
      p = c.position
        .clone()
        .set(a.x, a.y + 0.8, a.z)
        .project(c);
    return {
      x: ((p.x + 1) * innerWidth) / 2,
      y: ((1 - p.y) * innerHeight) / 2,
    };
  }, fixture.truck);
  if (info.project.use.hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect(page.locator('.inspect-data')).toContainText('貨運卡車');
  await expect(page.locator('.inspect-data')).toContainText('工業送貨');
  await expect(page.locator('.inspect-data')).toContainText(
    String(fixture.units),
  );
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await page.screenshot({
    path: `docs/screenshots/m2-13/${name}.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '查看目的地', exact: true }).click();
  await expect(page.locator('.inspect-data')).toHaveCount(0);
  expect(
    await page.evaluate(
      (id) =>
        window.__webcityBuildings!().find((b) => b.id === id)!.cargo!.stock,
      fixture.target,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(
    (id) =>
      window.__webcityBuildings!().find((b) => b.id === id)!.cargo!.stock > 0,
    fixture.target,
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  expect(
    await page.evaluate(
      (id) => window.__webcityVehicles!.samples(100).some((a) => a.id === id),
      fixture.truck,
    ),
  ).toBe(false);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.screenshot({
      path: 'docs/screenshots/m2-13/iphone-landscape.png',
      scale: 'css',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  expect(errors).toEqual([]);
});
