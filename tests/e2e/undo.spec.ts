import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createState } from '../../src/sim/state';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
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
test('undo button and Ctrl/Cmd Z restore roads and funds without changing form input or saved cities', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'normal',
    cityName: '復原測試市',
  });
  s.terrain.heights.fill(60);
  const ticks = hourTicks(12);
  s.clock = {
    ticks,
    day: Math.floor(ticks / TIME.ticksPerDay),
    tickInDay: ticks % TIME.ticksPerDay,
    speed: 0,
  };
  await loadFixture(page, {
    settings: s.settings,
    population: 0,
    day: s.clock.day,
    data: Array.from(new Uint8Array(await serialize(s))),
  });
  const undo = page.getByRole('button', { name: '復原建造', exact: true }),
    controls = page.locator('.road-controls'),
    touch = !!info.project.use.hasTouch;
  await expect(undo).toBeDisabled();
  const build = async () => {
    const enter = page.getByRole('button', { name: '開始鋪路', exact: true });
    if (await enter.isVisible()) await enter.click();
    else
      await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
    await tap(page, -240, -80, touch);
    await tap(page, -80, -80, touch);
    if (touch)
      await page.getByRole('button', { name: '確認建造', exact: true }).tap();
    await expect(controls).toHaveAttribute('data-segments', '1');
    await expect(undo).toHaveAttribute('data-count', '1');
  };
  await build();
  const cost = Number(await undo.getAttribute('data-refund'));
  expect(cost).toBeGreaterThan(0);
  await expect(controls).toHaveAttribute('data-money', String(70000 - cost));
  await undo.scrollIntoViewIfNeeded();
  if (touch) await undo.tap();
  else await undo.click();
  await expect(controls).toHaveAttribute('data-segments', '0');
  await expect(controls).toHaveAttribute('data-money', '70000');
  await expect(undo).toBeDisabled();
  await expect(page.locator('.undo-status')).toContainText('已復原，退回');
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m4-18', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m4-18/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  await build();
  await page.locator('canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(controls).toHaveAttribute('data-segments', '0');
  await expect(controls).toHaveAttribute('data-money', '70000');
  await build();
  await page.locator('canvas').focus();
  await page.keyboard.press('Meta+z');
  await expect(controls).toHaveAttribute('data-segments', '0');
  await build();
  // Native form undo must not consume the city's history.
  await page.getByRole('button', { name: '財政', exact: true }).click();
  await page
    .locator('.finance-dialog details')
    .filter({ has: page.locator('summary', { hasText: '分區稅率' }) })
    .locator('summary')
    .click();
  const slider = page.locator('.finance-dialog input').first();
  await slider.focus();
  await page.keyboard.press('Control+z');
  await expect(undo).toHaveAttribute('data-count', '1');
  await page.getByRole('button', { name: '關閉財政', exact: true }).click();
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await undo.scrollIntoViewIfNeeded();
    await undo.tap();
    await expect(controls).toHaveAttribute('data-money', '70000');
    await page.screenshot({
      path: 'docs/screenshots/m4-18/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await page
    .getByRole('button', { name: '儲存並回主選單', exact: true })
    .click();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]', {
    state: 'attached',
  });
  await expect(undo).toBeDisabled();
  expect(errors).toEqual([]);
});
