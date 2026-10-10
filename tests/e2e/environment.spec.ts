import { test, expect, type Page } from '@playwright/test';
import { environmentCity } from '../fixtures/environmentCity';
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
test('upstream sewage reaches the pump and residents; removing the outlet clears drinking water', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const fixture = await environmentCity(),
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
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.day >= 4);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  const polluted = await page.evaluate(() =>
    window.__webcityBuildings!().find((b) => b.id === 10001)!,
  );
  expect(polluted.drinkingWaterPollution).toBeGreaterThan(0);
  expect(polluted.health!.average).toBeLessThan(100);
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await fly(97, 0);
  await tap(page, 97, 0, touch);
  await expect(page.locator('.inspect-data')).toContainText('飲用水污染');
  await expect(page.locator('.inspect-data')).toContainText(
    `${polluted.drinkingWaterPollution!.toFixed(1)}%`,
  );
  await page
    .locator('.inspect-data')
    .getByText('飲用水污染', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m2-20/${name}-dirty-water.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  await page.locator('.bulldoze-controls select').selectOption('building');
  await fly(56, -64);
  await tap(page, 56, -64, touch);
  await page.waitForFunction(
    () => !window.__webcityBuildings!().some((b) => b.id === 10003),
  );
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.day >= 6);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  const clean = await page.evaluate(() =>
    window.__webcityBuildings!().find((b) => b.id === 10001)!,
  );
  expect(clean.drinkingWaterPollution).toBe(0);
  await fly(97, 0);
  await tap(page, 97, 0, touch);
  await expect(page.locator('.inspect-data')).toContainText('0.0%');
  await page
    .locator('.inspect-data')
    .getByText('飲用水污染', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m2-20/${name}-clean-water.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page
      .locator('.inspect-data')
      .getByText('飲用水污染', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/m2-20/iphone-landscape.png',
      scale: 'css',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  expect(errors).toEqual([]);
});
