import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { facilityCity } from '../fixtures/facilityCity';
// Keep new model verification independent of the PWA media cache.
test.use({ serviceWorkers: 'block' });
test('loads formal facilities in the city, preserves wind animation, and displays civic and landmark models', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false }),
    ),
  );
  const fixture = await facilityCity();
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
    window.__webcityCamera!.flyTo({ x: 0, z: 30 }, 400),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityFacilityStats!().loaded), {
      timeout: 30000,
    })
    .toBeGreaterThanOrEqual(25);
  expect(
    await page.evaluate(() => window.__webcityFacilityStats!().rotors),
  ).toBe(1);
  const angle = await page.evaluate(
    () => window.__webcityFacilityStats!().rotorAngle,
  );
  await page.waitForTimeout(600);
  expect(
    await page.evaluate(() => window.__webcityFacilityStats!().rotorAngle),
  ).not.toBe(angle);
  await page.addStyleTag({
    content:
      '.debug-panel,.picking-debug,.population-summary,.toolbar-content,.city-notifications{display:none!important} .road-controls[data-layout="phone-landscape"]{background:transparent;border:0}',
  });
  await mkdir('docs/screenshots/m3-12', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await page.screenshot({
    path: `docs/screenshots/m3-12/${slug}-city.jpg`,
    type: 'jpeg',
    quality: 86,
    scale: 'css',
  });
  for (const model of [
    'svc_cemetery',
    'svc_crematorium',
    'svc_fire_hq',
    'svc_water_treatment',
    'svc_unique_opera_house',
    'svc_unique_lighthouse',
  ]) {
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
    ).toBe(232);
    await page.screenshot({
      path: `docs/screenshots/m3-12/${slug}-${model}.jpg`,
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
      path: 'docs/screenshots/m3-12/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 86,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
