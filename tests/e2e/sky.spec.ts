import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('daylight stays clear as fog thins with camera altitude', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(
    `./?play=1&debug=1&quality=${info.project.name === 'Desktop' ? 'high' : 'medium'}`,
  );
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug {display:none!important}',
  });
  await mkdir('docs/screenshots/m3-04', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  const densities: number[] = [];
  for (const [name, distance] of [
    ['street', 250],
    ['panorama', 3800],
  ] as const) {
    await page.evaluate(
      (distance) => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, distance),
      distance,
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeCloseTo(distance, 1);
    await expect
      .poll(async () =>
        Number(
          await page.locator('.debug-panel').getAttribute('data-fog-density'),
        ),
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(600);
    densities.push(
      Number(
        await page.locator('.debug-panel').getAttribute('data-fog-density'),
      ),
    );
    await page.screenshot({
      path: `docs/screenshots/m3-04/${slug}-${name}.png`,
      scale: 'css',
    });
  }
  expect(densities[1]).toBeLessThan(densities[0]! * 0.8);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.screenshot({
      path: 'docs/screenshots/m3-04/iPhone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
