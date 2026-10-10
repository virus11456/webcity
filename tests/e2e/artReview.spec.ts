import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename } from 'node:path';
import { artReviewCity } from '../fixtures/artReviewCity';
import { dayNightCity } from '../fixtures/dayNightCity';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
async function fly(page: Page, x: number, z: number, distance: number) {
  await page.evaluate(
    ({ x, z, distance }) => window.__webcityCamera!.flyTo({ x, z }, distance),
    { x, z, distance },
  );
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, z, distance }) => {
          const s = window.__webcityCamera!.readState();
          return Math.max(
            Math.abs(s.x - x),
            Math.abs(s.z - z),
            Math.abs(s.distance - distance),
          );
        },
        { x, z, distance },
      ),
    )
    .toBeLessThan(0.1);
  await page.waitForTimeout(700);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = window.__webcityBuildingStats!();
        return s.transitioning + s.lodPending;
      }),
    )
    .toBe(0);
}
async function promo(page: Page, path: string) {
  const style = await page.addStyleTag({
    content:
      'body *{visibility:hidden!important}canvas{visibility:visible!important}',
  });
  await page.screenshot({ path, type: 'jpeg', quality: 94, scale: 'css' });
  await style.evaluate((element) => element.parentNode?.removeChild(element));
}
const clean = '.debug-panel,.picking-debug{display:none!important}';
test('reviews all city lighting stages, 400m zoning readability and six promotional views', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  const scripts = new Set<string>();
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.add(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const dir = 'docs/screenshots/m3-20',
    slug = info.project.name.replaceAll(' ', '-');
  await mkdir(dir, { recursive: true });
  await page.goto('./?debug=1');
  await expect(page.locator('.main-menu')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const startupScripts = [];
  for (const url of scripts) {
    const name = basename(new URL(url).pathname);
    const bytes = await readFile(`dist/assets/${name}`);
    startupScripts.push({ name, gzipBytes: gzipSync(bytes).length });
  }
  const startupGzip = startupScripts.reduce((sum, s) => sum + s.gzipBytes, 0);
  expect(startupGzip).toBeLessThan(400000);
  await writeFile(
    `${dir}/${slug}-startup.json`,
    JSON.stringify({ startupGzip, scripts: startupScripts }, null, 2) + '\n',
  );
  for (const [name, hour] of [
    ['day-panorama', 12],
    ['dusk', 19],
    ['night', 22],
  ] as const) {
    await loadFixture(page, await artReviewCity(hour));
    await page.getByRole('button', { name: '探索城市', exact: true }).click();
    await page.addStyleTag({ content: clean });
    await expect(page.locator('.toolbar-content')).not.toBeVisible();
    await fly(page, 0, 0, info.project.name === 'iPhone 15' ? 1600 : 1100);
    await expect
      .poll(async () =>
        Number(await page.locator('.debug-panel').getAttribute('data-hour')),
      )
      .toBeCloseTo(hour, 1);
    expect(
      await page.evaluate(() => window.__webcityBuildingStats!().buildings),
    ).toBe(108);
    expect(
      await page.evaluate(() => window.__webcityBuildings!().length),
    ).toBeGreaterThan(108);
    expect(
      await page.evaluate(() =>
        window.__webcityBuildings!().every((b) => (b.flags & 1) !== 0),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        window.__webcityBuildings!()
          .filter((b) => b.kind === 'zoned')
          .every((b) => (b.flags & 7) === 7),
      ),
    ).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__webcityVegetation!().pending))
      .toBe(false);
    await page.screenshot({
      path: `${dir}/${slug}-${name}.jpg`,
      animations: 'disabled',
      quality: 92,
      scale: 'css',
    });
    if (info.project.name === 'Desktop') {
      // Promotion frames show only the actual WebGL game render, with no image compositing.
      await promo(page, `${dir}/promo-${name}.jpg`);
    }
    if (hour === 12) {
      const distance = await page.evaluate(
        () => 400 / Math.sin(window.__webcityCamera!.readState().elevation),
      );
      await fly(page, 0, 0, distance);
      expect(
        await page.evaluate(
          () => window.__webcityCamera!.camera.position.y - 60,
        ),
      ).toBeCloseTo(400, 0);
      await page.screenshot({
        path: `${dir}/${slug}-400m.jpg`,
        animations: 'disabled',
        quality: 92,
        scale: 'css',
      });
      if (info.project.name === 'iPhone 15') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(250);
        await page.screenshot({
          path: `${dir}/iPhone-390x844.jpg`,
          animations: 'disabled',
          quality: 92,
          scale: 'css',
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(390);
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(250);
        await page.screenshot({
          path: `${dir}/iPhone-landscape.jpg`,
          animations: 'disabled',
          quality: 92,
          scale: 'css',
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(844);
        await page.setViewportSize({ width: 393, height: 852 });
      }
      // Move around the same street; review both views for road/ground/lot coplanar artifacts.
      for (const [view, x, z] of [
        ['street', -220, -40],
        ['industry', 210, -20],
      ] as const) {
        await fly(page, x, z, 220);
        await expect
          .poll(() =>
            page.evaluate(() => window.__webcityBuildingStats!().assets),
          )
          .toBeGreaterThan(5);
        await page.screenshot({
          path: `${dir}/${slug}-${view}.jpg`,
          animations: 'disabled',
          quality: 92,
          scale: 'css',
        });
        if (info.project.name === 'Desktop')
          await promo(page, `${dir}/promo-${view}.jpg`);
      }
      const stats = await page.evaluate(() => ({
        calls: Number(
          document.querySelector('.debug-panel')!.getAttribute('data-calls'),
        ),
        triangles: Number(
          document
            .querySelector('.debug-panel')!
            .getAttribute('data-triangles'),
        ),
        graphics: window.__webcityGraphics!(),
        buildings: window.__webcityBuildingStats!(),
        vegetation: window.__webcityVegetation!(),
        fps: Number(
          document.querySelector('.debug-panel')!.getAttribute('data-fps'),
        ),
      }));
      await writeFile(
        `${dir}/${slug}-stats.json`,
        JSON.stringify(stats, null, 2) + '\n',
      );
      await page.getByRole('button', { name: '暫停選單', exact: true }).click();
      await expect(page.locator('.pause-dialog')).toBeVisible();
      await page.locator('.pause-dialog summary').click();
      await page.screenshot({
        path: `${dir}/${slug}-settings.jpg`,
        animations: 'disabled',
        quality: 88,
        scale: 'css',
      });
    }
  }
  await loadFixture(page, await dayNightCity(8));
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.addStyleTag({ content: clean });
  await fly(page, 0, -90, 150);
  await expect
    .poll(() => page.evaluate(() => window.__webcityVehicles!.stats().visible))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: `${dir}/${slug}-traffic.jpg`,
    animations: 'disabled',
    quality: 92,
    scale: 'css',
  });
  if (info.project.name === 'Desktop')
    await promo(page, `${dir}/promo-traffic.jpg`);
  await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
  await expect(page.locator('.toolbar-content')).toBeVisible();
  expect(errors).toEqual([]);
});
