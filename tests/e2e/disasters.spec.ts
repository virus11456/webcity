import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { uniqueState } from '../fixtures/uniqueCity';
import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
import { NOTIFICATIONS } from '../../src/data/notifications';
test.use({ serviceWorkers: 'block' });
async function activate(control: Locator, touch: boolean) {
  if (touch) await control.tap();
  else await control.click();
}
async function settings(page: Page, touch: boolean) {
  await activate(
    page.getByRole('button', { name: '暫停選單', exact: true }),
    touch,
  );
  if (
    !(await page
      .locator('.pause-dialog details')
      .evaluate((el) => (el as HTMLDetailsElement).open))
  )
    await activate(page.locator('.pause-dialog summary'), touch);
}
test('optional disaster warns, burns, rebuilds with cost and saves its setting', async ({
  page,
  hasTouch,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = uniqueState();
  s.buildings = [s.buildings[0]!];
  s.buildings[0]!.pos = { x: 0, z: 9 };
  s.settings.cityName = '災後重建市';
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
  await settings(page, hasTouch);
  const toggle = page.getByRole('checkbox', {
    name: '啟用大型火災災害',
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await activate(toggle, hasTouch);
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeEnabled();
  await activate(
    page.getByRole('button', { name: '返回城市', exact: true }),
    hasTouch,
  );
  await activate(
    page.getByRole('button', { name: '探索城市', exact: true }),
    hasTouch,
  );
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 25 }, 200),
  );
  await activate(
    page.getByRole('button', { name: '×4', exact: true }),
    hasTouch,
  );
  await expect(page.locator('[data-code="disasterWarning"]')).toBeVisible({
    timeout: 40000,
  });
  await activate(
    page.getByRole('button', { name: '暫停', exact: true }),
    hasTouch,
  );
  await settings(page, hasTouch);
  await expect(
    page.locator('.disaster-settings [role="status"]'),
  ).toContainText('火災預警');
  await mkdir('docs/screenshots/m4-14', { recursive: true });
  await toggle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `docs/screenshots/m4-14/${info.project.name.replaceAll(' ', '-')}-warning.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
    animations: 'disabled',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/m4-14/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
  await activate(
    page.getByRole('button', { name: '返回城市', exact: true }),
    hasTouch,
  );
  await activate(
    page.getByRole('button', { name: '×1', exact: true }),
    hasTouch,
  );
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some((b) => b.fire?.burning),
  );
  await activate(
    page.getByRole('button', { name: '暫停', exact: true }),
    hasTouch,
  );
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await page.screenshot({
    path: `docs/screenshots/m4-14/${info.project.name.replaceAll(' ', '-')}-fire.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
    animations: 'disabled',
  });
  await activate(
    page.getByRole('button', { name: '×1', exact: true }),
    hasTouch,
  );
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some((b) => b.state === 'burned'),
  );
  await activate(
    page.getByRole('button', { name: '暫停', exact: true }),
    hasTouch,
  );
  // Paused simulation still lets notices expire in real time. Do not retain
  // indexed close-button locators across the notification host's re-renders.
  await expect(page.locator('.city-notice')).toHaveCount(0, {
    timeout: NOTIFICATIONS.visibleMs + NOTIFICATIONS.pollMs + 2000,
  });
  const p = await page.evaluate(() => {
    const c = window.__webcityCamera!.camera,
      v = c.position.clone().set(0, 60, 20).project(c);
    return {
      x: ((v.x + 1) * innerWidth) / 2,
      y: ((1 - v.y) * innerHeight) / 2,
    };
  });
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      p,
    ),
  ).toBe('CANVAS');
  if (hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect(page.locator('.inspect-data')).toContainText('重建費用');
  await expect(page.locator('.inspect-data')).not.toContainText('運作中');
  const rebuild = page.getByRole('button', {
    name: '重建燒毀建築',
    exact: true,
  });
  await rebuild.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m4-14/${info.project.name.replaceAll(' ', '-')}-rebuild.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
    animations: 'disabled',
  });
  const before = await page.evaluate(() => window.__webcityStats!()!.money);
  const bounds = await rebuild.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await activate(rebuild, hasTouch);
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some((b) => b.state === 'construction'),
  );
  expect(await page.evaluate(() => window.__webcityStats!()!.money)).toBe(
    before - 2000,
  );
  await activate(
    page
      .locator('.inspect-host')
      .getByRole('button', { name: '關閉面板', exact: true }),
    hasTouch,
  );
  await activate(
    page.getByRole('button', { name: '存檔與讀檔', exact: true }),
    hasTouch,
  );
  await activate(
    page
      .locator('[data-slot="1"]')
      .getByRole('button', { name: '儲存', exact: true }),
    hasTouch,
  );
  await expect(page.locator('.save-status')).toHaveText('存檔清單已更新');
  await page.reload();
  await activate(
    page.getByRole('button', { name: '繼續最近的城市', exact: true }),
    hasTouch,
  );
  await page.waitForSelector('.road-controls[data-ready="true"]');
  expect(
    await page.evaluate(() =>
      window.__webcityBuildings!().some((b) => b.state === 'construction'),
    ),
  ).toBe(true);
  await settings(page, hasTouch);
  await expect(toggle).toBeChecked();
  await activate(toggle, hasTouch);
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('.disaster-settings [role="status"]')).toHaveText(
    '目前沒有災害預警',
  );
  expect(errors).toEqual([]);
});
