import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { catalogCity } from '../fixtures/catalogCity';
// Network failure acceptance must intercept requests, not the PWA's media cache.
test.use({ serviceWorkers: 'block' });
test('loads formal residences in the real city and keeps fallback geometry when downloads fail', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('503'))
      errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false }),
    ),
  );
  let fail = true;
  let failedRequests = 0;
  await page.route('**/models/bld_*.glb', (route) => {
    if (fail) {
      failedRequests++;
      return route.fulfill({ status: 503, body: 'offline fixture' });
    }
    return route.continue();
  });
  const fixture = await catalogCity();
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

  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 200 }, 250),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildingStats!().detail))
    .toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(() => window.__webcityBuildingStats!().assets),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.__webcityBuildingStats!().buildings),
  ).toBe(90);
  expect(failedRequests).toBeGreaterThan(0);
  fail = false;
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 3000),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildingStats!().detail))
    .toBe(0);
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 200 }, 250),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildingStats!().assets), {
      timeout: 30000,
    })
    .toBeGreaterThan(5);
  await page.addStyleTag({
    content:
      '.debug-panel,.picking-debug,.population-summary,.toolbar-content,.city-notifications{display:none!important} .road-controls[data-layout="phone-landscape"]{background:transparent;border:0}',
  });
  await mkdir('docs/screenshots/m3-10', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await page.screenshot({
    path: `docs/screenshots/m3-10/${slug}-city.jpg`,
    type: 'jpeg',
    quality: 86,
    scale: 'css',
  });
  for (const model of ['bld_rl_l2_2x2_03', 'bld_rh_l5_4x4_02']) {
    await page.goto(`./?asset-gallery=1&model=${model}`);
    await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true', {
      timeout: 30000,
    });
    await expect(page.locator('canvas')).toHaveAttribute('data-model', model);
    expect(
      await page
        .getByRole('combobox', { name: '模型', exact: true })
        .locator('option')
        .count(),
    ).toBeGreaterThanOrEqual(190);
    await page.screenshot({
      path: `docs/screenshots/m3-10/${slug}-${model}.jpg`,
      type: 'jpeg',
      quality: 86,
      scale: 'css',
    });
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.getByRole('button', { name: '重設視角', exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/m3-10/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 86,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
