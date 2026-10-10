import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { waterSurfaceCity } from '../fixtures/waterSurfaceCity';

test('water has animated normals, shore foam, and authoritative downstream pollution', async ({
  page,
}, info) => {
  // Color comparison controls lighting; nighttime moonlight intentionally changes hue.
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false }),
    ),
  );
  const fixture = await waterSurfaceCity(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(
    `./?quality=${info.project.name === 'Desktop' ? 'high' : 'medium'}&debug=1`,
  );
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

  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.addStyleTag({
    content:
      ".debug-panel,.picking-debug,.population-summary,.toolbar-content { display:none !important; } .road-controls[data-layout='phone-landscape'] { background:transparent; border:0; }",
  });
  await page.evaluate(() => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 350));
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(350, 1);
  const before = await page.locator('canvas').screenshot({ scale: 'css' });
  const points = await page.evaluate(() =>
    [-70, 70].map((z) => {
      const c = window.__webcityCamera!.camera;
      const p = c.position.clone().set(0, 40, z).project(c);
      return {
        x: Math.round(((p.x + 1) * innerWidth) / 2),
        y: Math.round(((1 - p.y) * innerHeight) / 2),
      };
    }),
  );
  const raster = await sharp(before)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = points.map(({ x, y }) =>
    Array.from(
      raster.data.subarray(
        (y * raster.info.width + x) * 3,
        (y * raster.info.width + x) * 3 + 3,
      ),
    ),
  );
  expect(rgb[0]![2]!).toBeGreaterThan(rgb[0]![0]!);
  expect(rgb[1]![0]!).toBeGreaterThan(rgb[1]![2]!);
  await page.waitForTimeout(700);
  const after = await page.locator('canvas').screenshot({ scale: 'css' });
  expect(before.equals(after)).toBe(false);
  await mkdir('docs/screenshots/m3-03', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await page.screenshot({
    path: `docs/screenshots/m3-03/${slug}-water.png`,
    scale: 'css',
  });
  await page.evaluate(() => window.__webcityCamera!.tilt(-0.5));
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `docs/screenshots/m3-03/${slug}-reflection.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.screenshot({
      path: 'docs/screenshots/m3-03/iPhone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
