import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { trafficCity } from '../fixtures/trafficCity';
import { loadFixture } from './loadFixture';
import { VEHICLE_MODELS } from '../../src/data/vehicleModels';
test.use({ serviceWorkers: 'block' });
test('loads all vehicle models and keeps commuters moving and visible through model replacement', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await loadFixture(page, await trafficCity());
  await expect
    .poll(
      () => page.evaluate(() => window.__webcityVehicles!.stats().modelsLoaded),
      { timeout: 30000 },
    )
    .toBe(16);
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 300));
  await expect
    .poll(() => page.evaluate(() => window.__webcityVehicles!.stats().visible))
    .toBeGreaterThan(100);
  const before = await page.evaluate(
    () => window.__webcityVehicles!.samples(1)[0]!,
  );
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.waitForFunction((p) => {
    const a = window
      .__webcityVehicles!.samples(1500)
      .find((a) => a.id === p.id);
    return a && Math.hypot(a.x - p.x, a.z - p.z) > 1;
  }, before);
  await mkdir('docs/screenshots/m3-13', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await page.screenshot({
    path: `docs/screenshots/m3-13/${slug}-traffic.jpg`,
    type: 'jpeg',
    quality: 86,
    scale: 'css',
  });
  for (const m of VEHICLE_MODELS) {
    await page.goto(`./?asset-gallery=1&model=${m.id}`);
    await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true', {
      timeout: 30000,
    });
    expect(
      Number(await page.locator('canvas').getAttribute('data-triangles')),
    ).toBeLessThanOrEqual(600);
    if (
      ['veh_car_3', 'veh_truck_3', 'veh_fire_1', 'veh_metro_1'].includes(m.id)
    )
      await page.screenshot({
        path: `docs/screenshots/m3-13/${slug}-${m.id}.jpg`,
        type: 'jpeg',
        quality: 86,
        scale: 'css',
      });
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.getByRole('button', { name: '重設視角', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/m3-13/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 86,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
