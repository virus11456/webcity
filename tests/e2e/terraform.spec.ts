import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { uniqueState } from '../fixtures/uniqueCity';
import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
import { hourTicks } from '../../src/world/schedules';
import { TIME, SEA_LEVEL } from '../../src/data/config';
test.use({ serviceWorkers: 'block' });
async function focus(page: Page, z: number) {
  await page.evaluate(
    (z) => window.__webcityCamera!.flyTo({ x: 0, z }, 350),
    z,
  );
  await page.waitForFunction(
    (z) =>
      Math.abs(window.__webcityCamera!.readState().distance - 350) < 0.1 &&
      Math.abs(window.__webcityCamera!.readState().z - z) < 0.1,
    z,
  );
}
async function tap(page: Page, x: number, z: number, touch: boolean) {
  const p = await page.evaluate(
    ({ x, z }) => {
      const c = window.__webcityCamera!.camera,
        v = c.position
          .clone()
          .set(x, window.__webcityTerrain!(x, z).height, z)
          .project(c);
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
  return p;
}
test('sandbox earthworks protect existing roads, change height and water, and survive reload', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = uniqueState();
  s.settings.mode = 'sandbox';
  s.settings.cityName = '地形測試市';
  const ticks = hourTicks(12);
  s.clock = {
    ticks,
    day: Math.floor(ticks / TIME.ticksPerDay),
    tickInDay: ticks % TIME.ticksPerDay,
    speed: 0,
  };
  const sim = new Simulation(s.settings, undefined, s);
  await loadFixture(page, {
    settings: s.settings,
    population: 0,
    day: s.clock.day,
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
  });
  await page.getByRole('button', { name: '地形編輯', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '地形編輯', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await focus(page, 0);
  await tap(page, 0, 0, !!info.project.use.hasTouch);
  await expect(page.locator('.terraform-controls')).toContainText('地基');
  await expect(
    page.getByRole('button', { name: '確認整地', exact: true }),
  ).toBeDisabled();
  await focus(page, 192);
  await tap(page, 0, 192, !!info.project.use.hasTouch);
  await expect(page.locator('.terraform-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  expect(
    (await page.evaluate(() => window.__webcityTerrain!(0, 192))).height,
  ).toBe(60);
  if (info.project.use.hasTouch) {
    const p = await tap(page, 0, 192, true),
      cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...p, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { ...p, id: 1 },
        { x: p.x + 30, y: p.y, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
  } else
    await page.getByRole('button', { name: '取消預覽', exact: true }).click();
  await expect(page.locator('.terraform-controls')).toHaveAttribute(
    'data-valid',
    'false',
  );
  expect(
    (await page.evaluate(() => window.__webcityTerrain!(0, 192))).height,
  ).toBe(60);
  await tap(page, 0, 192, !!info.project.use.hasTouch);
  await page.getByRole('button', { name: '確認整地', exact: true }).click();
  await page.waitForFunction(
    () => window.__webcityTerrain!(0, 192).height > 63,
  );
  await page.getByLabel('地形筆刷', { exact: true }).selectOption('lower');
  await tap(page, 0, 192, !!info.project.use.hasTouch);
  await page.getByRole('button', { name: '確認整地', exact: true }).click();
  await page.waitForFunction(
    () => Math.abs(window.__webcityTerrain!(0, 192).height - 60) < 0.1,
  );
  const waterBefore = await page.evaluate(
    () => window.__webcityTerrain!(0, 192).waterVersion,
  );
  await page.getByLabel('地形筆刷', { exact: true }).selectOption('river');
  await tap(page, 0, 192, !!info.project.use.hasTouch);
  await page.getByRole('button', { name: '確認整地', exact: true }).click();
  await page.waitForFunction(
    (level) => window.__webcityTerrain!(0, 192).height < level,
    SEA_LEVEL,
  );
  await page.waitForFunction(
    (v) => window.__webcityTerrain!(0, 192).waterVersion > v,
    waterBefore,
  );
  expect(
    (await page.evaluate(() => window.__webcityTerrain!(0, 0))).height,
  ).toBe(60);
  for (const notice of await page.locator('.notice-dismiss').all())
    if (await notice.isVisible()) await notice.click();
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m4-12', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m4-12/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByLabel('地形筆刷', { exact: true }).selectOption('flatten');
    await expect(
      page.getByRole('button', { name: '確認整地', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/screenshots/m4-12/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
  const before = await page.evaluate(
    () => window.__webcityTerrain!(0, 192).height,
  );
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
    (await page.evaluate(() => window.__webcityTerrain!(0, 192))).height,
  ).toBeCloseTo(before);
  expect(errors).toEqual([]);
});
