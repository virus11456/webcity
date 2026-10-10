import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('shadow tiers remain correct near streets and after the focus moves', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mkdir('docs/screenshots/m3-05', { recursive: true });
  for (const [quality, shadows] of [
    ['high', 3],
    ['medium', 1],
    ['low', 0],
  ] as const) {
    await page.goto(`./?play=1&quality=${quality}&debug=1`);
    await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.debug-panel')).toHaveAttribute(
      'data-shadows',
      String(shadows),
    );
    await page.addStyleTag({
      content: '.debug-panel,.picking-debug {display:none!important}',
    });
    await page.evaluate(() =>
      window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 250),
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeCloseTo(250, 1);
    await page.screenshot({
      path: `docs/screenshots/m3-05/${info.project.name.replaceAll(' ', '-')}-${quality}.png`,
      scale: 'css',
    });
    await page.evaluate(() =>
      window.__webcityCamera!.flyTo({ x: -450, z: -350 }, 200),
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeCloseTo(200, 1);
    await expect(page.locator('.debug-panel')).toHaveAttribute(
      'data-shadows',
      String(shadows),
    );
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.screenshot({
      path: 'docs/screenshots/m3-05/iPhone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
