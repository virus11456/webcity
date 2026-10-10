import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { loadFixture } from './loadFixture';
import { effectsCity } from '../fixtures/effectsCity';
test.use({ serviceWorkers: 'block' });
test('applies quality and individual graphics without reloading, including automatic downgrade notice', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Drive the actual renderer's frame sampler with slow timestamps, without loading the host CPU.
  await page.addInitScript(() => {
    const frame = window.requestAnimationFrame.bind(window);
    let offset = 0;
    window.requestAnimationFrame = (cb) =>
      frame((time) => {
        if ((window as Window & { testSlowFrames?: boolean }).testSlowFrames)
          offset += 100;
        cb(time + offset);
      });
  });
  await loadFixture(page, await effectsCity());
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 20 }, 400),
  );
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await expect(page.locator('.pause-dialog')).toBeVisible();
  await page.locator('.pause-dialog summary').click();
  const quality = page.getByRole('combobox', { name: '畫質', exact: true });
  const shadow = page.getByRole('checkbox', { name: '陰影', exact: true });
  const postfx = page.getByRole('checkbox', { name: '後製效果', exact: true });
  const tilt = page.getByRole('checkbox', { name: '移軸景深', exact: true });
  await quality.selectOption('high');
  await expect
    .poll(() => page.evaluate(() => window.__webcityGraphics!().shadowsActive))
    .toBe(3);
  await shadow.uncheck();
  await expect
    .poll(() => page.evaluate(() => window.__webcityGraphics!().shadowsActive))
    .toBe(0);
  await shadow.check();
  await expect
    .poll(() => page.evaluate(() => window.__webcityGraphics!().shadowsActive))
    .toBe(3);
  await postfx.uncheck();
  await expect
    .poll(() => page.evaluate(() => window.__webcityGraphics!().postfxActive))
    .toBe(0);
  await postfx.check();
  await expect
    .poll(() => page.evaluate(() => window.__webcityGraphics!().tilt))
    .toBeGreaterThan(0);
  await tilt.uncheck();
  await expect
    .poll(() => page.evaluate(() => window.__webcityGraphics!().tilt))
    .toBe(0);
  await tilt.check();
  const trees = page.getByRole('slider', { name: '樹木密度', exact: true });
  await trees.press('Home');
  await expect
    .poll(() => page.evaluate(() => window.__webcityVegetation!().rendered))
    .toBe(0);
  await trees.press('End');
  await expect
    .poll(() => page.evaluate(() => window.__webcityVegetation!().rendered))
    .toBeGreaterThan(1000);
  for (const [level, shadows, density] of [
    ['medium', 1, 1],
    ['low', 0, 0.5],
    ['high', 3, 1],
  ] as const) {
    await quality.selectOption(level);
    await expect
      .poll(() => page.evaluate(() => window.__webcityGraphics!().quality))
      .toBe(level);
    expect(
      await page.evaluate(() => window.__webcityGraphics!().shadowsActive),
    ).toBe(shadows);
    expect(await page.evaluate(() => window.__webcityGraphics!().density)).toBe(
      density,
    );
  }
  await page.getByRole('checkbox', { name: '日夜循環', exact: true }).uncheck();
  await expect
    .poll(async () =>
      Number(await page.locator('.debug-panel').getAttribute('data-hour')),
    )
    .toBe(12);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await mkdir('docs/screenshots/m3-19', { recursive: true });
  await quality.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m3-19/${info.project.name.replaceAll(' ', '-')}.jpg`,
    animations: 'disabled',
    quality: 86,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await tilt.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/m3-19/iPhone-landscape.jpg',
      animations: 'disabled',
      quality: 86,
      scale: 'css',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
  await quality.selectOption('auto');
  await page.getByRole('button', { name: '返回城市', exact: true }).click();
  await expect(page.locator('.pause-dialog')).not.toBeVisible();
  await page.waitForTimeout(5500); // Finish the healthy startup window first.
  const initial = await page.evaluate(
    () => window.__webcityGraphics!().quality,
  );
  expect(initial).not.toBe('low');
  await page.evaluate(() => {
    (window as Window & { testSlowFrames?: boolean }).testSlowFrames = true;
  });
  await expect
    .poll(() => page.evaluate(() => window.__webcityGraphics!().quality), {
      timeout: 12000,
    })
    .not.toBe(initial);
  await expect(
    page.locator('[data-code="qualityLow"], [data-code="qualityMedium"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('webcity-preferences')!).quality,
    ),
  ).toBe('auto');
  expect(errors).toEqual([]);
});
