import { test, expect, type Page } from '@playwright/test';
import { policeCity } from '../fixtures/policeCity';
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
test('crime warning and daily police reduction follow the actual connected road area', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const fixture = await policeCity(),
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
    window.__webcityProblemIcons!().ids.includes(10001),
  );
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await page.screenshot({
    path: `docs/screenshots/m2-15/${name}-warning.png`,
    scale: 'css',
  });
  await tap(page, 80, 16, touch);
  await expect(page.locator('.inspect-data')).toContainText('犯罪率');
  await expect(page.locator('.inspect-data')).toContainText('80.0%');
  await page.screenshot({
    path: `docs/screenshots/m2-15/${name}.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
  await fly(-100, 25);
  await tap(page, -100, 24, touch);
  await page.getByRole('button', { name: '啟用設施', exact: true }).click();
  await expect(page.locator('.inspect-data')).toContainText('運作中');
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.day >= 1);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  const rates = await page.evaluate(() =>
    window.__webcityBuildings!()
      .filter((b) => b.kind === 'zoned')
      .map((b) => ({
        id: b.id,
        crime: b.crime,
        coverage: b.coverage?.police ?? 0,
      })),
  );
  expect(rates.find((b) => b.id === 10001)!.crime).toBeLessThan(80);
  expect(rates.find((b) => b.id === 10001)!.coverage).toBeGreaterThan(0);
  expect(rates.find((b) => b.id === 10002)!.crime).toBeGreaterThan(80);
  expect(rates.find((b) => b.id === 10002)!.coverage).toBe(0);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await fly(80, 20);
    await tap(page, 80, 16, touch);
    await expect(page.locator('.inspect-data')).toContainText('犯罪率');
    await page.screenshot({
      path: 'docs/screenshots/m2-15/iphone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
