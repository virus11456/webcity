import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { roadTypesCity } from '../fixtures/roadTypesCity';
test('renders original road surfaces with markings and instanced lights at each quality', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  test.setTimeout(90000);
  await mkdir('docs/screenshots/m3-08', { recursive: true });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false }),
    ),
  );
  const fixture = await roadTypesCity();
  await page.goto(
    `./?quality=${info.project.name === 'Desktop' ? 'high' : 'medium'}&debug=1`,
  );
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
  expect(
    await page.evaluate(() => window.__webcityRoadStats!().lamps),
  ).toBeGreaterThan(20);
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.addStyleTag({
    content:
      '.debug-panel,.picking-debug,.population-summary,.toolbar-content,.city-notifications{display:none!important} .road-controls[data-layout="phone-landscape"]{background:transparent;border:0}',
  });
  for (const distance of [90, 350]) {
    await page.evaluate(
      (d) => window.__webcityCamera!.flyTo({ x: 30, z: -25 }, d),
      distance,
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeCloseTo(distance, 1);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `docs/screenshots/m3-08/${info.project.name.replaceAll(' ', '-')}-${distance}.png`,
      scale: 'css',
    });
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/m3-08/iPhone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
