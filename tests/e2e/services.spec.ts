import { test, expect, type Page } from '@playwright/test';
import { serviceCity } from '../fixtures/serviceCity';
async function tap(page: Page, x: number, z: number, touch: boolean) {
  const p = await page.evaluate(
    ({ x, z }) => {
      const c = window.__webcityCamera!.camera,
        v = c.position.clone().set(x, 60, z).project(c);
      return {
        x: ((v.x + 1) * innerWidth) / 2,
        y: ((1 - v.y) * innerHeight) / 2,
      };
    },
    { x, z },
  );
  expect(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, p),
  ).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
test('previews road-distance services, places a station and toggles real coverage while paused', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const fixture = await serviceCity(),
    errors: string[] = [],
    touch = !!info.project.use.hasTouch;
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

  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -180, z: 30 }, 350),
  );
  await page.waitForFunction(
    () =>
      Math.abs(window.__webcityCamera!.readState().distance - 350) < 0.1 &&
      !window.__webcityRoadStats!().pending,
  );
  await page.getByRole('button', { name: '公共服務', exact: true }).click();
  await tap(page, -180, 9, touch);
  await expect(page.locator('.service-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  expect(
    Number(await page.locator('.service-controls').getAttribute('data-reach')),
  ).toBeGreaterThan(0);
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await page.screenshot({
    path: `docs/screenshots/m2-14/${name}-preview.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some((b) => b.defId === 'police_station'),
  );
  const provider = await page.evaluate(() =>
    window.__webcityBuildings!().find((b) => b.defId === 'police_station')!,
  );
  expect(provider.kind).toBe('service');
  expect(provider.serviceStatus!.connected).toBe(true);
  await page.waitForFunction(
    () =>
      (window.__webcityBuildings!().find((b) => b.id === 10001)!.coverage
        ?.police ?? 0) > 0,
  );
  expect(
    await page.evaluate(
      () =>
        window.__webcityBuildings!().find((b) => b.id === 10002)!.coverage
          ?.police ?? 0,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -180, z: 30 }, 350),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 350) < 0.1,
  );
  await tap(page, -180, 24, touch);
  await expect(page.locator('.inspect-data')).toContainText('警察局');
  await expect(page.locator('.inspect-data')).toContainText('道路連通');
  await page.getByRole('button', { name: '停用設施', exact: true }).click();
  await expect(page.locator('.inspect-data')).toContainText('已停用');
  await page.waitForFunction(
    () =>
      (window.__webcityBuildings!().find((b) => b.id === 10001)!.coverage
        ?.police ?? 0) === 0,
  );
  await page.getByRole('button', { name: '啟用設施', exact: true }).click();
  await expect(page.locator('.inspect-data')).toContainText('運作中');
  await page.waitForFunction(
    () =>
      (window.__webcityBuildings!().find((b) => b.id === 10001)!.coverage
        ?.police ?? 0) > 0,
  );
  await page.screenshot({
    path: `docs/screenshots/m2-14/${name}.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.getByRole('button', { name: '停用設施', exact: true }).click();
    await expect(page.locator('.inspect-data')).toContainText('已停用');
    await page.getByRole('button', { name: '啟用設施', exact: true }).click();
    await expect(page.locator('.inspect-data')).toContainText('運作中');
    await page.screenshot({
      path: 'docs/screenshots/m2-14/iphone-landscape.png',
      scale: 'css',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  if (info.project.name === 'Desktop') {
    await page.getByRole('button', { name: '關閉面板', exact: true }).click();
    await page.screenshot({
      path: 'docs/screenshots/m2-14/desktop-building.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
