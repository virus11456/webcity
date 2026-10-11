import { districtBrush } from '../../src/world/districts';
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { busState } from '../fixtures/busCity';
import { Simulation } from '../../src/sim/simulation';
import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
test('applies global and district policies, updates resource demand and persists explicit overrides', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = busState();
  s.settings.cityName = '政策測試市';
  s.clock = {
    ticks: hourTicks(12),
    day: Math.floor(hourTicks(12) / TIME.ticksPerDay),
    tickInDay: 0,
    speed: 0,
  };
  s.districts = [
    {
      id: s.nextId++,
      name: '西岸住宅區',
      cells: districtBrush([s.buildings[0]!.pos], 96, s.ownedTiles),
    },
  ];
  const snapshot = new Simulation(s.settings, undefined, s).snapshot();
  await loadFixture(page, {
    settings: s.settings,
    population: s.stats.population,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
  });
  await page.getByRole('button', { name: '政策', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '政策', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.policy-row')).toHaveCount(11);
  // Snapshot restoration may defer physical resource settlement until the first command.
  await dialog.getByLabel('節能計畫', { exact: true }).selectOption('on');
  await expect(dialog).toHaveAttribute('data-pending', 'false');
  const reduced = await page.evaluate(
    () => window.__webcityStats!()!.power.consumed,
  );
  await dialog.getByLabel('節能計畫', { exact: true }).selectOption('off');
  await expect(dialog).toHaveAttribute('data-pending', 'false');
  const baseline = await page.evaluate(
    () => window.__webcityStats!()!.power.consumed,
  );
  expect(reduced).toBeCloseTo(baseline * 0.85);
  await dialog.getByLabel('節能計畫', { exact: true }).selectOption('on');
  await expect(dialog).toHaveAttribute('data-pending', 'false');
  await dialog.getByLabel('節水計畫', { exact: true }).selectOption('on');
  await expect(dialog).toHaveAttribute('data-pending', 'false');
  await dialog.getByLabel('回收計畫', { exact: true }).selectOption('on');
  await expect(dialog).toHaveAttribute('data-pending', 'false');
  await dialog
    .getByLabel('政策適用範圍')
    .selectOption(String(s.districts[0]!.id));
  await expect(dialog.getByLabel('節能計畫', { exact: true })).toHaveValue(
    'inherit',
  );
  await dialog.getByLabel('節能計畫', { exact: true }).selectOption('off');
  await expect(dialog).toHaveAttribute('data-pending', 'false');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__webcityDistricts!()[0]!.policies?.energy_saving,
      ),
    )
    .toBe(false);
  const local = await page.evaluate(
    () => window.__webcityStats!()!.power.consumed,
  );
  expect(local).toBeGreaterThan(reduced);
  expect(local).toBeLessThan(baseline);
  await dialog.getByLabel('禁止高樓', { exact: true }).selectOption('on');
  await expect(dialog).toHaveAttribute('data-pending', 'false');
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityBuildings!()[0]!.floorLimit),
    )
    .toBe(4);
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildings!()[0]!.level))
    .toBe(3);
  await dialog.evaluate((el) => (el.scrollTop = 0));
  const out = 'docs/screenshots/m4-05';
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
  await dialog.getByRole('button', { name: '關閉政策', exact: true }).click();
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
  await page.getByRole('button', { name: '政策', exact: true }).click();
  await expect(dialog.getByLabel('節能計畫', { exact: true })).toHaveValue(
    'on',
  );
  await dialog
    .getByLabel('政策適用範圍')
    .selectOption(String(s.districts[0]!.id));
  await expect(dialog.getByLabel('節能計畫', { exact: true })).toHaveValue(
    'off',
  );
  await dialog.getByLabel('節能計畫', { exact: true }).selectOption('inherit');
  await expect(dialog).toHaveAttribute('data-pending', 'false');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__webcityDistricts!()[0]!.policies?.energy_saving,
      ),
    )
    .toBeUndefined();
  expect(errors).toEqual([]);
});
