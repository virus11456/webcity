import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { uniqueState } from '../fixtures/uniqueCity';
import { Simulation } from '../../src/sim/simulation';
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
test('landmark catalog enforces prerequisites, places the original model and restores uniqueness', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = uniqueState();
  const ticks = hourTicks(12);
  s.clock = {
    ticks,
    day: Math.floor(ticks / TIME.ticksPerDay),
    tickInDay: ticks % TIME.ticksPerDay,
    speed: 0,
  };
  const daylight = new Simulation(s.settings, undefined, s);
  await loadFixture(page, {
    settings: s.settings,
    population: 0,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(daylight.snapshot()))),
  });
  await page.getByRole('button', { name: '獨特建築', exact: true }).click();
  const hall = page.locator('[data-item="unique_city_hall"]');
  await expect(
    page.getByRole('button', { name: '獨特建築', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(hall).toBeEnabled();
  await expect(hall).toContainText('地價加成 +24');
  await expect(page.locator('[data-item="unique_museum"]')).toBeDisabled();
  await expect(page.locator('[data-item="unique_museum"]')).toContainText(
    '小學',
  );
  await expect(
    page.locator('.service-controls .build-card:visible'),
  ).toHaveCount(12);
  await hall.click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 30 }, 350),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 350) < 0.1,
  );
  await tap(page, 0, 9, !!info.project.use.hasTouch);
  await expect(page.locator('.service-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some((b) => b.defId === 'unique_city_hall'),
  );
  await page.waitForFunction(
    () =>
      window.__webcityFacilityStats!().pending === 0 &&
      window.__webcityFacilityStats!().loaded >= 2,
  );
  await expect(hall).toBeDisabled();
  await expect(hall).toContainText('全城限一棟');
  for (const notice of await page.locator('.city-notice button').all()) {
    if (await notice.isVisible()) {
      const label = await notice.getAttribute('aria-label');
      if (label?.includes('關閉') || label?.includes('忽略'))
        await notice.click();
    }
  }
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m4-11', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m4-11/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole('button', { name: '公共服務', exact: true }).click();
    await page.getByRole('button', { name: '獨特建築', exact: true }).click();
    await expect(hall).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/screenshots/m4-11/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
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
  await page.getByRole('button', { name: '獨特建築', exact: true }).click();
  await expect(hall).toBeDisabled();
  expect(errors).toEqual([]);
});
