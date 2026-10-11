import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { metroState } from '../fixtures/metroCity';
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
test('builds metro stations and tunnels, carries residents underground and restores the saved line', async ({
  page,
}, info) => {
  test.setTimeout(100000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = metroState();
  s.buildings = s.buildings.filter((b) => b.defId !== 'metro_station');
  s.clock = {
    ticks: hourTicks(12),
    day: Math.floor(hourTicks(12) / TIME.ticksPerDay),
    tickInDay: 0,
    speed: 0,
  };
  const sim = new Simulation(s.settings, undefined, s),
    snapshot = sim.snapshot();
  await loadFixture(page, {
    settings: s.settings,
    population: s.stats.population,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
  });
  await page.getByRole('button', { name: '地鐵', exact: true }).click();
  const touch = !!info.project.use.hasTouch;
  for (const [index, x] of [-140, 140].entries()) {
    await page.getByRole('button', { name: '建造地鐵站', exact: true }).click();
    await stop(page, x, -112, touch);
    await expect(page.locator('.service-controls')).toHaveAttribute(
      'data-valid',
      'true',
    );
    await page.getByRole('button', { name: '確認設置', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__webcityBuildings!().filter(
              (b) => b.defId === 'metro_station',
            ).length,
        ),
      )
      .toBe(index + 1);
    await page.getByRole('button', { name: '地鐵', exact: true }).click();
  }
  const stations = await page.evaluate(() =>
    window.__webcityBuildings!()
      .filter((b) => b.defId === 'metro_station')
      .map((b) => b.pos),
  );
  await page.getByRole('button', { name: '地鐵', exact: true }).click();

  await stop(page, stations[0]!.x, stations[0]!.z, touch);
  await expect(page.locator('.metro-controls')).toHaveAttribute(
    'data-stops',
    '1',
  );
  await stop(page, stations[1]!.x, stations[1]!.z, touch);
  await expect(page.locator('.metro-controls')).toHaveAttribute(
    'data-stops',
    '2',
  );
  await page
    .getByRole('button', { name: '鋪軌並開通環線', exact: true })
    .click();
  await expect(page.locator('.bus-line')).toHaveCount(1);
  await expect(page.locator('.metro-controls')).toHaveAttribute(
    'data-stops',
    '0',
  );
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__webcityTransit!()[0]!.passengers +
            window.__webcityTransit!()[0]!.lastPassengers,
        ),
      { timeout: 35000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window
          .__webcityVehicles!.samples(300)
          .some((v) => v.kind === 9 && v.y < 50),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('[data-underground="true"]')).toHaveCount(1);
  const line = await page.evaluate(() => window.__webcityTransit!()[0]!);
  expect(line.revenue + line.lastRevenue).toBe(
    (line.passengers + line.lastPassengers) * 4,
  );
  await page.evaluate(() => {
    const bus = window
      .__webcityVehicles!.samples(200)
      .find((v) => v.kind === 9);
    if (bus) window.__webcityCamera!.flyTo({ x: bus.x, z: bus.z }, 250);
  });
  await page.waitForTimeout(1300);
  const out = 'docs/screenshots/m4-02';
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
  }
  if (info.project.name === 'iPhone 15')
    await page.setViewportSize({ width: 393, height: 852 });
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
  await page.getByRole('button', { name: '地鐵', exact: true }).click();
  const restored = await page.evaluate(() => window.__webcityTransit!()[0]!);
  expect(restored.revenue + restored.lastRevenue).toBe(
    line.revenue + line.lastRevenue,
  );
  expect(restored.onboard).toBe(line.onboard);
  await page.getByRole('button', { name: '刪除路線', exact: true }).click();
  await expect(page.locator('.bus-line')).toHaveCount(0);
  expect(errors).toEqual([]);
});
