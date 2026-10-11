import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { deathcareState } from '../fixtures/deathcareCity';
import { Simulation } from '../../src/sim/simulation';
import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
async function tap(page: Page, x: number, z: number, touch: boolean) {
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
test('hearses move, collect and return; a full cemetery warns and persists', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { s } = deathcareState();
  s.clock = {
    ticks: hourTicks(12),
    day: Math.floor(hourTicks(12) / TIME.ticksPerDay),
    tickInDay: 0,
    speed: 0,
  };
  s.buildings[0]!.mortuary = {
    stock: 1999,
    processedToday: 0,
    lastDay: s.clock.day,
    vehicles: 0,
    full: false,
  };
  const sim = new Simulation(s.settings, undefined, s);
  await loadFixture(page, {
    settings: s.settings,
    population: 0,
    day: s.clock.day,
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
  });
  await page.getByRole('button', { name: '公共服務', exact: true }).click();
  for (const id of ['cemetery', 'crematorium'])
    await expect(page.locator(`[data-item="${id}"]`)).toBeEnabled();
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__webcityVehicles!.samples().filter((v) => v.kind === 7)
            .length,
      ),
    )
    .toBeGreaterThan(0);
  const before = await page.evaluate(() =>
    window.__webcityVehicles!.samples().find((v) => v.kind === 7)!,
  );
  await expect
    .poll(() =>
      page.evaluate(({ id, x, z }) => {
        const v = window.__webcityVehicles!.samples().find((v) => v.id === id);
        return v ? Math.hypot(v.x - x, v.z - z) : 0;
      }, before),
    )
    .toBeGreaterThan(1);
  expect(
    await page.evaluate(
      () =>
        window.__webcityBuildings!().find((b) => b.id === 10002)!.bodies!
          .pending,
    ),
  ).toBe(3);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__webcityBuildings!().find((b) => b.id === 10001)!.mortuary!
              .stock,
        ),
      { timeout: 30000 },
    )
    .toBe(2000);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  // No synthetic deaths during this short fixture trip.
  const remaining = await page.evaluate(
    () =>
      window.__webcityBuildings!().find((b) => b.id === 10002)!.bodies!.pending,
  );
  expect(remaining).toBe(2);
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -150, z: 25 }, 350),
  );
  await page.waitForTimeout(1100);
  await tap(page, -150, 24, !!info.project.use.hasTouch);
  await expect(page.locator('.inspect-data')).toContainText('墓園');
  await expect(page.locator('.inspect-data')).toContainText('2000 / 2000');
  await expect(page.locator('.inspect-data')).toContainText('容量已滿');
  await page
    .getByText('容量已滿，請增設殯葬設施', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  const out = 'docs/screenshots/m4-08';
  await mkdir(out, { recursive: true });
  await page.screenshot({
    path: `${out}/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole('button', { name: '停用設施', exact: true }).click();
    await expect(page.locator('.inspect-data')).toContainText('已停用');
    await page.getByRole('button', { name: '啟用設施', exact: true }).click();
    await expect(page.locator('.inspect-data')).toContainText('運作中');
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
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
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
  expect(
    await page.evaluate(
      () => window.__webcityBuildings!().find((b) => b.id === 10001)!.mortuary,
    ),
  ).toMatchObject({ stock: 2000, full: true, vehicles: 0 });
  expect(errors).toEqual([]);
});

test('crematorium processes delivered bodies daily without occupying graves', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { s } = deathcareState();
  s.clock = {
    ticks: hourTicks(12),
    day: Math.floor(hourTicks(12) / TIME.ticksPerDay),
    tickInDay: 0,
    speed: 0,
  };
  s.buildings[0]!.defId = 'crematorium';
  s.buildings[0]!.mortuary = {
    stock: 100,
    processedToday: 0,
    lastDay: s.clock.day,
    vehicles: 0,
    full: false,
  };
  s.buildings[1]!.bodies!.pending = 0;
  const sim = new Simulation(s.settings, undefined, s);
  await loadFixture(page, {
    settings: s.settings,
    population: 0,
    day: s.clock.day,
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
  });
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__webcityBuildings!().find((b) => b.id === 10001)!.mortuary!
            .processedToday,
      ),
    )
    .toBe(100);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.__webcityBuildings!().find((b) => b.id === 10001)!.mortuary!
          .stock,
    ),
  ).toBe(0);
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -150, z: 25 }, 350),
  );
  await page.waitForTimeout(1100);
  await tap(page, -150, 24, !!info.project.use.hasTouch);
  await expect(page.locator('.inspect-data')).toContainText('火葬場');
  await expect(page.locator('.inspect-data')).toContainText('0 / 200');
  await page.getByText('今日火化數', { exact: true }).scrollIntoViewIfNeeded();
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m4-08', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m4-08/${info.project.name.replaceAll(' ', '-')}-crematorium.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  expect(errors).toEqual([]);
});
