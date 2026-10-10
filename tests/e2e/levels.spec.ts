import { test, expect, type Page } from '@playwright/test';
import { levelsCity } from '../fixtures/levelsCity';
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
test('educated residential district upgrades through all five levels with real parks and utilities', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const fixture = await levelsCity(),
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
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await fly(97, 0);
  await page.screenshot({
    path: `docs/screenshots/m2-21/${name}-lv1.png`,
    scale: 'css',
  });
  for (let level = 2; level <= 5; level++) {
    await page.getByRole('button', { name: '×4', exact: true }).click();
    await page.waitForFunction(
      (level) =>
        window.__webcityBuildings!().find((b) => b.id === 10001)?.level ===
        level,
      level,
      { timeout: 25000 },
    );
    await page.getByRole('button', { name: '暫停', exact: true }).click();
    await page.waitForSelector('.sim-controls[data-speed="0"]');
    const home = await page.evaluate(() =>
      window.__webcityBuildings!().find((b) => b.id === 10001)!,
    );
    expect(home.landValue).toBeGreaterThanOrEqual(81);
    expect(home.happiness).toBeGreaterThan(70);
    expect(home.flags & 3).toBe(3);
  }
  await page.screenshot({
    path: `docs/screenshots/m2-21/${name}-lv5.png`,
    scale: 'css',
  });
  await tap(page, 97, 0, touch);
  await expect(page.locator('.inspect-data')).toContainText('已達最高等級');
  await page
    .locator('.inspect-data')
    .getByText('已達最高等級', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m2-21/${name}-inspect.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page
      .locator('.inspect-data')
      .getByText('已達最高等級', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/m2-21/iphone-landscape.png',
      scale: 'css',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  expect(errors).toEqual([]);
});
