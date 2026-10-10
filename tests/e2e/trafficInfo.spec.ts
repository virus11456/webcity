import { test, expect } from '@playwright/test';
import { trafficCity } from '../fixtures/trafficCity';
test('displays queued roads in red with live road traffic inspection', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await trafficCity(1000);
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
  await page.getByRole('button', { name: '資訊圖層', exact: true }).click();
  await page
    .getByLabel('選擇資訊圖層', { exact: true })
    .selectOption('traffic');
  await expect(page.locator('.info-legend')).toContainText('紅 <40%');
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `docs/screenshots/m2-12/${name}.png`,
    scale: 'css',
  });
  const point = await page.evaluate(() => {
    const camera = window.__webcityCamera!.camera;
    for (const x of [-260, -180, -120, 0, 180])
      for (const z of [-100, -60, -20, 20, 60, 100]) {
        const v = camera.position.clone().set(x, 60, z).project(camera),
          p = {
            x: ((v.x + 1) * innerWidth) / 2,
            y: ((1 - v.y) * innerHeight) / 2,
          };
        if (
          p.x > 70 &&
          p.y > 180 &&
          p.y < innerHeight - 150 &&
          document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS'
        )
          return p;
      }
    return null;
  });
  expect(point).not.toBeNull();
  if (info.project.use.hasTouch) await page.touchscreen.tap(point!.x, point!.y);
  else await page.mouse.click(point!.x, point!.y);
  await expect(
    page.locator('.inspect-data[data-kind="segment"]'),
  ).toBeVisible();
  await expect(
    page.getByText('目前車數（不含行人）', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('平均車速', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/m2-12/${name}-inspect.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
  if (name === 'iphone') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/m2-12/iphone-landscape.png',
      scale: 'css',
    });
  }
  await page.getByRole('button', { name: '關閉圖層', exact: true }).click();
  await expect(page.locator('.info-panel')).toBeHidden();
  expect(errors).toEqual([]);
});
