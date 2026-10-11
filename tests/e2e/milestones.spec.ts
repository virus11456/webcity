import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { milestoneState } from '../fixtures/milestoneCity';
import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
test('population unlocks services and rewards once; celebration and reload work on each device', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = milestoneState(),
    sim = new Simulation(s.settings, undefined, s);
  await loadFixture(page, {
    settings: s.settings,
    population: 510,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
  });
  await page.getByRole('button', { name: '公共服務', exact: true }).click();
  await expect(page.locator('[data-item="police_station"]')).toBeDisabled();
  await page.getByRole('button', { name: '×1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '城市里程碑', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('MS1 · 小村莊');
  await expect(dialog).toContainText('+$10,000');
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  const out = 'docs/screenshots/m4-09';
  await mkdir(out, { recursive: true });
  await page.screenshot({
    path: `${out}/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page
      .getByRole('button', { name: '繼續建設城市', exact: true })
      .scrollIntoViewIfNeeded();
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
  await page.getByRole('button', { name: '繼續建設城市', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  if (info.project.name === 'iPhone 15')
    await page.setViewportSize({ width: 393, height: 852 });
  await expect(page.locator('[data-item="police_station"]')).toBeEnabled();
  await expect(page.locator('[data-item="cemetery"]')).toBeDisabled();
  await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
  await expect(page.locator('[data-item="road_medium"]')).toBeEnabled();
  const before = await page.evaluate(() => window.__webcityStats!()!.money);
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
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '公共服務', exact: true }).click();
  await expect(page.locator('[data-item="police_station"]')).toBeEnabled();
  expect(await page.evaluate(() => window.__webcityStats!()!.money)).toBe(
    before,
  );
  expect(errors).toEqual([]);
});
