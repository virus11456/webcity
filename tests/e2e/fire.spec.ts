import { test, expect, type Page } from '@playwright/test';
import { fireCity } from '../fixtures/fireCity';
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
test('real fire truck extinguishes the near home while the unreachable deadline burns the distant home', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const fixture = await fireCity(),
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

  const fly = async (x: number, z: number) => {
    await page.evaluate(
      ({ x, z }) => window.__webcityCamera!.flyTo({ x, z }, 250),
      { x, z },
    );
    await page.waitForFunction(
      ({ x, z }) => {
        const c = window.__webcityCamera!.readState();
        return (
          Math.abs(c.distance - 250) < 0.1 &&
          Math.abs(c.x - x) < 0.1 &&
          Math.abs(c.z - z) < 0.1
        );
      },
      { x, z },
    );
  };
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await fly(80, 20);
  await page.waitForFunction(() =>
    window.__webcityVehicles!.samples(20).some((v) => v.kind === 4),
  );
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await page.screenshot({
    path: `docs/screenshots/m2-16/${name}-fire.png`,
    scale: 'css',
  });
  await fly(0, 12);
  const truck = await page.evaluate(() => {
    const v = window.__webcityVehicles!.samples(20).find((v) => v.kind === 4)!;
    const p = window
      .__webcityCamera!.camera.position.clone()
      .set(v.x, v.y + 1, v.z)
      .project(window.__webcityCamera!.camera);
    return {
      x: ((p.x + 1) * innerWidth) / 2,
      y: ((1 - p.y) * innerHeight) / 2,
    };
  });
  expect(
    await page.evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.tagName,
      truck,
    ),
  ).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(truck.x, truck.y);
  else await page.mouse.click(truck.x, truck.y);
  await expect(page.locator('.inspect-data')).toContainText('消防車');
  await expect(page.locator('.inspect-data')).toContainText('前往火場救援');
  await page.screenshot({
    path: `docs/screenshots/m2-16/${name}-truck.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.day >= 2);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  const result = await page.evaluate(() =>
    window.__webcityBuildings!().filter((b) => b.kind === 'zoned'),
  );
  expect(result.find((b) => b.id === 10001)!.fire!.burning).toBe(false);
  expect(result.find((b) => b.id === 10001)!.state).toBe('active');
  expect(result.find((b) => b.id === 10002)!.state).toBe('burned');
  await fly(80, 20);
  await tap(page, 80, 16, touch);
  await expect(page.locator('.inspect-data')).toContainText('已撲滅');
  await page.screenshot({
    path: `docs/screenshots/m2-16/${name}-rescued.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
  await fly(-180, 320);
  await page.screenshot({
    path: `docs/screenshots/m2-16/${name}-burned.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await fly(-180, 320);
    await tap(page, -180, 316, touch);
    await expect(page.locator('.inspect-data')).toContainText('已燒毀');
    await page.screenshot({
      path: 'docs/screenshots/m2-16/iphone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
