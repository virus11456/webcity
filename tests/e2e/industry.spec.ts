import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { busState } from '../fixtures/busCity';
import { Simulation } from '../../src/sim/simulation';
import { districtCell } from '../../src/world/districts';
import { INDUSTRY_SPECIALIZATIONS as TYPES } from '../../src/data/policies';
import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
test('chooses four district industries, inspects resource layers and retains choices after saving', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = busState(),
    base = s.buildings[1]!;
  s.buildings = s.buildings.filter((b) => b.id !== base.id);
  s.settings.cityName = '自然資源工業市';
  s.clock = {
    ticks: hourTicks(12),
    day: Math.floor(hourTicks(12) / TIME.ticksPerDay),
    tickInDay: 0,
    speed: 0,
  };
  for (const [i, def] of TYPES.entries()) {
    const b = {
      ...structuredClone(base),
      id: s.nextId++,
      pos: { x: -96 + i * 64, z: -100 },
    };
    s.buildings.push(b);
    s.districts.push({
      id: s.nextId++,
      name: ['林業區', '農業區', '礦業區', '石油區'][i]!,
      cells: [districtCell(b.pos)],
    });
    s.terrain.resources[def.resource].fill(190);
  }
  const sim = new Simulation(s.settings, undefined, s);
  await loadFixture(page, {
    settings: s.settings,
    population: s.stats.population,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
  });
  await page.getByRole('button', { name: '行政區', exact: true }).click();
  for (const [i, def] of TYPES.entries()) {
    await page
      .getByLabel('選擇行政區', { exact: true })
      .selectOption(String(s.districts[i]!.id));
    await page.getByLabel('工業特化', { exact: true }).selectOption(def.id);
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.__webcityBuildings!().find((b) => b.id === id)?.industry,
          s.buildings[i + 2]!.id,
        ),
      )
      .toBe(def.id);
  }
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: -130 }, 380),
  );
  await page.waitForTimeout(1400);
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  const out = 'docs/screenshots/m4-06';
  await mkdir(out, { recursive: true });
  await page.screenshot({
    path: `${out}/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(350);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel('工業特化', { exact: true }).selectOption('general');
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityDistricts!()[3]!.industry),
      )
      .toBeUndefined();
    await page
      .getByLabel('工業特化', { exact: true })
      .selectOption('industry_oil');
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityDistricts!()[3]!.industry),
      )
      .toBe('industry_oil');
    await page.screenshot({
      path: `${out}/iPhone-landscape.jpg`,
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `${out}/${info.project.name.replaceAll(' ', '-')}-buildings.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  await page.getByRole('button', { name: '資訊圖層', exact: true }).click();
  for (const id of ['forest', 'fertile', 'ore', 'oil']) {
    await page.getByLabel('選擇資訊圖層', { exact: true }).selectOption(id);
    await expect(page.locator('.info-panel')).toHaveAttribute('data-view', id);
    await expect(page.locator('.info-legend')).toBeVisible();
  }
  if (info.project.name === 'Desktop')
    await page.screenshot({
      path: `${out}/resources.jpg`,
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
  await page.getByRole('button', { name: '關閉圖層', exact: true }).click();
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
    await page.evaluate(() =>
      window.__webcityDistricts!().map((d) => d.industry),
    ),
  ).toEqual(TYPES.map((d) => d.id));
  expect(errors).toEqual([]);
});
