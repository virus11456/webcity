import { test, expect } from '@playwright/test';
import { bridgeCity } from '../fixtures/bridgeCity';
test('builds elevated roads with accessible height controls and displays bridge structures', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await bridgeCity();
  await page.goto('./?quality=low&debug=1');
  await expect(page.locator('.main-menu')).toBeVisible();
  // Seed a valid save through the browser's normal IndexedDB schema, then use the real load button.
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

  await page.waitForFunction(() => !window.__webcityRoadStats!().pending);
  const controls = page.locator('.road-controls');
  await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
  await page.getByRole('button', { name: '升高 ＋', exact: true }).click();
  await expect(controls).toHaveAttribute('data-elevation', '6');
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -160, z: -200 }, 1200),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 1200) < 0.1,
  );
  for (const x of [-240, -80]) {
    const p = await page.evaluate((x) => {
      const c = window.__webcityCamera!.camera,
        p = c.position.clone().set(x, 60, -200).project(c);
      return {
        x: ((p.x + 1) * innerWidth) / 2,
        y: ((1 - p.y) * innerHeight) / 2,
      };
    }, x);
    expect(
      await page.evaluate(
        (p) => document.elementFromPoint(p.x, p.y)?.tagName,
        p,
      ),
    ).toBe('CANVAS');
    if (info.project.use.hasTouch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  }
  if (info.project.use.hasTouch) {
    await expect(controls).toHaveAttribute('data-valid', 'true');
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  }
  await expect(controls).toHaveAttribute('data-segments', '4');
  await page.getByRole('button', { name: '降低 −', exact: true }).click();
  await expect(controls).toHaveAttribute('data-elevation', '0');
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  const d = info.project.name === 'iPhone 15' ? 900 : 650;
  await page.evaluate(
    (d) => window.__webcityCamera!.flyTo({ x: 40, z: 0 }, d),
    d,
  );
  await page.waitForFunction(
    (d) => Math.abs(window.__webcityCamera!.readState().distance - d) < 0.1,
    d,
  );
  await page.waitForFunction(() => !window.__webcityRoadStats!().pending);
  await page.screenshot({
    path: `docs/screenshots/m2-04/${info.project.name === 'Desktop' ? 'desktop' : info.project.name === 'iPhone 15' ? 'iphone' : 'ipad'}.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.getByRole('button', { name: '鋪設道路', exact: true }).tap();
    await page.getByRole('button', { name: '升高 ＋', exact: true }).tap();
    await expect(controls).toHaveAttribute('data-elevation', '6');
    for (const name of ['升高 ＋', '降低 −']) {
      const box = await page
        .getByRole('button', { name, exact: true })
        .boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(852);
    }
    await page.screenshot({
      path: 'docs/screenshots/m2-04/iphone-landscape.png',
      scale: 'css',
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
