import { test, expect } from '@playwright/test';
import { roadTypesCity } from '../fixtures/roadTypesCity';
test('shows all road types, one-way markings, medians and trees with usable controls', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await roadTypesCity();
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
  expect(
    await page.evaluate(() => window.__webcityRoadStats!().trees),
  ).toBeGreaterThan(20);
  await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
  const select = page.getByRole('combobox', { name: '道路種類', exact: true });
  for (const type of [
    'road_small',
    'road_small_oneway',
    'road_small_trees',
    'road_medium',
    'road_large',
    'highway',
    'highway_ramp',
    'gravel',
  ]) {
    await select.selectOption(type);
    await expect(select).toHaveValue(type);
  }
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  const d = info.project.name === 'iPhone 15' ? 1250 : 1000;
  await page.evaluate(
    (d) => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, d),
    d,
  );
  await page.waitForFunction(
    (d) => Math.abs(window.__webcityCamera!.readState().distance - d) < 0.1,
    d,
  );
  await page.screenshot({
    path: `docs/screenshots/m2-02/${info.project.name === 'Desktop' ? 'desktop' : info.project.name === 'iPhone 15' ? 'iphone' : 'ipad'}.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.screenshot({
      path: 'docs/screenshots/m2-02/iphone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
