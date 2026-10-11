import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { busState } from '../fixtures/busCity';
import { Simulation } from '../../src/sim/simulation';
import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
async function stop(page: Page, x: number, z: number, touch: boolean) {
  await page.evaluate(
    ({ x, z }) => window.__webcityCamera!.flyTo({ x, z }, 500),
    { x, z },
  );
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, z }) => {
          const c = window.__webcityCamera!.readState();
          return Math.max(
            Math.abs(c.x - x),
            Math.abs(c.z - z),
            Math.abs(c.distance - 500),
          );
        },
        { x, z },
      ),
    )
    .toBeLessThan(0.1);
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
test('paints, names, erases and saves districts with population and job statistics', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = busState();
  s.settings.cityName = '行政區測試市';
  s.clock = {
    ticks: hourTicks(12),
    day: Math.floor(hourTicks(12) / TIME.ticksPerDay),
    tickInDay: 0,
    speed: 0,
  };
  const sim = new Simulation(s.settings, undefined, s);
  await loadFixture(page, {
    settings: s.settings,
    population: s.stats.population,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
  });
  await page.getByRole('button', { name: '行政區', exact: true }).click();
  await page.getByRole('button', { name: '新增行政區', exact: true }).click();
  await expect(page.locator('.district-controls')).toHaveAttribute(
    'data-count',
    '1',
  );
  await page.getByLabel('行政區名稱', { exact: true }).fill('西岸住宅區');
  await page.getByRole('button', { name: '重新命名', exact: true }).click();
  await expect(page.getByLabel('選擇行政區')).toContainText('西岸住宅區');
  await page.getByRole('button', { name: '大筆刷', exact: true }).click();
  await stop(page, -180, -100, !!info.project.use.hasTouch);
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityDistricts!()[0]!.population),
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: '新增行政區', exact: true }).click();
  await expect(page.locator('.district-controls')).toHaveAttribute(
    'data-count',
    '2',
  );
  await page.getByLabel('行政區名稱', { exact: true }).fill('東岸工業區');
  await page.getByRole('button', { name: '重新命名', exact: true }).click();
  await stop(page, 180, -100, !!info.project.use.hasTouch);
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistricts!()[1]!.jobs))
    .toBeGreaterThan(0);
  const before = await page.evaluate(
    () => window.__webcityDistricts!()[1]!.cells.length,
  );
  await page.getByRole('button', { name: '小筆刷', exact: true }).click();
  await page.getByRole('button', { name: '橡皮擦', exact: true }).click();
  await stop(page, 180, -100, !!info.project.use.hasTouch);
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityDistricts!()[1]!.cells.length),
    )
    .toBeLessThan(before);
  await page.getByRole('button', { name: '大筆刷', exact: true }).click();
  await stop(page, 180, -100, !!info.project.use.hasTouch);
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityDistricts!()[1]!.cells.length),
    )
    .toBe(before);
  await page.evaluate(
    (phone) =>
      window.__webcityCamera!.flyTo(
        phone ? { x: 180, z: -100 } : { x: 0, z: 0 },
        1000,
      ),
    info.project.name === 'iPhone 15',
  );
  await page.waitForTimeout(1300);
  const out = 'docs/screenshots/m4-04';
  await mkdir(out, { recursive: true });
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await page.screenshot({
    path: `${out}/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${out}/iPhone-landscape.jpg`,
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
  const districts = await page.evaluate(() => window.__webcityDistricts!());
  await page.getByRole('button', { name: '存檔與讀檔', exact: true }).click();
  await page
    .locator('[data-slot="1"]')
    .getByRole('button', { name: '儲存', exact: true })
    .click();
  await expect(page.locator('[data-slot="1"] img')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('存檔清單已更新');
  await page.reload();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  expect(await page.evaluate(() => window.__webcityDistricts!())).toEqual(
    districts,
  );
  await page.getByRole('button', { name: '行政區', exact: true }).click();
  await page.getByRole('button', { name: '刪除行政區', exact: true }).click();
  await expect(page.locator('.district-controls')).toHaveAttribute(
    'data-count',
    '1',
  );
  expect(errors).toEqual([]);
});
