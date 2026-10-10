import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { catalogCity } from '../fixtures/catalogCity';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
test('uses whole-city building LOD and reduces overview triangles by over sixty percent', async ({
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
  await loadFixture(page, await catalogCity('cio'));
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 20 }, 350),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildingStats!().assets), {
      timeout: 30000,
    })
    .toBeGreaterThan(80);
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityBuildingStats!().lodPending),
    )
    .toBe(0);
  await page.waitForTimeout(500);
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityBuildingStats!().transitioning),
    )
    .toBe(0);
  const close = await page.evaluate(() => window.__webcityBuildingStats!());
  expect(close.detail).toBeGreaterThan(16);
  expect(close.lods[1]).toBeGreaterThan(0);
  await mkdir('docs/screenshots/m3-14', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await page.addStyleTag({
    content:
      '.debug-panel,.picking-debug,.population-summary,.toolbar-content,.city-notifications{display:none!important} .road-controls[data-layout="phone-landscape"]{background:transparent;border:0}',
  });
  await page.screenshot({
    path: `docs/screenshots/m3-14/${slug}-near.jpg`,
    type: 'jpeg',
    quality: 86,
    scale: 'css',
  });
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 20 }, 1800),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildingStats!().detail))
    .toBe(0);
  await page.waitForTimeout(500);
  const far = await page.evaluate(() => window.__webcityBuildingStats!());
  expect(far.triangles).toBeLessThan(close.triangles * 0.4);
  expect(far.pools).toBe(0);
  expect(far.buildings).toBe(close.buildings);
  console.log(
    JSON.stringify({
      viewport: info.project.name,
      near: close,
      far,
      reduction: 1 - far.triangles / close.triangles,
    }),
  );
  await page.screenshot({
    path: `docs/screenshots/m3-14/${slug}-overview.jpg`,
    type: 'jpeg',
    quality: 86,
    scale: 'css',
  });
  // Re-enter the same block: the full catalogue must recover with no empty lots.
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 20 }, 240),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildingStats!().assets))
    .toBeGreaterThan(80);
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildingStats!().lods[0]))
    .toBeGreaterThan(0);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `docs/screenshots/m3-14/${slug}-street.jpg`,
    type: 'jpeg',
    quality: 86,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/m3-14/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 86,
      scale: 'css',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  expect(errors).toEqual([]);
});
