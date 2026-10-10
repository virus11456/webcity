import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { effectsCity } from '../fixtures/effectsCity';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
test('shows factory smoke, fire, construction and a real completed upgrade, then switches effects off with quality', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false }),
    ),
  );
  await loadFixture(page, await effectsCity());
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -65, z: 52 }, 245),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityEffects!().smoke))
    .toBe(120);
  await expect
    .poll(() => page.evaluate(() => window.__webcityEffects!().sprites))
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__webcityBuildingStats!().assets))
    .toBeGreaterThan(1);
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 245) < 0.1,
  );
  await page.waitForTimeout(800);
  await mkdir('docs/screenshots/m3-15', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await page.addStyleTag({
    content:
      '.debug-panel,.picking-debug,.population-summary,.toolbar-content,.city-notifications{display:none!important}.road-controls[data-layout="phone-landscape"]{background:transparent;border:0}',
  });
  await page.screenshot({
    path: `docs/screenshots/m3-15/${slug}-effects.jpg`,
    type: 'jpeg',
    quality: 88,
    scale: 'css',
  });
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 65, z: 72 }, 170),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 170) < 0.1,
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityBuildingStats!().transitioning),
    )
    .toBe(0);
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityEffects!().halos), {
      intervals: [20, 30, 50],
    })
    .toBeGreaterThan(0);
  await page.screenshot({
    path: `docs/screenshots/m3-15/${slug}-upgrade.jpg`,
    type: 'jpeg',
    quality: 88,
    scale: 'css',
  });
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityEffects!().halos))
    .toBe(0);
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await expect(page.locator('.pause-dialog')).toBeVisible();
  if (
    !(await page
      .getByRole('combobox', { name: '畫質', exact: true })
      .isVisible())
  )
    await page.locator('.pause-dialog summary').click();
  await page
    .getByRole('combobox', { name: '畫質', exact: true })
    .selectOption('low');
  await expect
    .poll(() => page.evaluate(() => window.__webcityEffects!().quality))
    .toBe('low');
  expect(await page.evaluate(() => window.__webcityEffects!().smoke)).toBe(0);
  expect(await page.evaluate(() => window.__webcityEffects!().sprites)).toBe(0);
  expect(
    await page.evaluate(() => window.__webcityBuildingStats!().effects),
  ).toBe(false);
  await page.getByRole('button', { name: '返回城市', exact: true }).click();
  await expect(page.locator('.pause-dialog')).not.toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/m3-15/${slug}-low.jpg`,
    type: 'jpeg',
    quality: 86,
    scale: 'css',
  });
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await expect(page.locator('.pause-dialog')).toBeVisible();
  if (
    !(await page
      .getByRole('combobox', { name: '畫質', exact: true })
      .isVisible())
  )
    await page.locator('.pause-dialog summary').click();
  await page
    .getByRole('combobox', { name: '畫質', exact: true })
    .selectOption('medium');
  await page.getByRole('button', { name: '返回城市', exact: true }).click();
  await expect(page.locator('.pause-dialog')).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__webcityEffects!().smoke))
    .toBe(48);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'docs/screenshots/m3-15/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 86,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
