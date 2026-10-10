import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('terrain details render near, distant, and steep views with existing lighting', async ({
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
    content: '.debug-panel,.picking-debug { display:none !important; }',
  });
  const slug = info.project.name.replaceAll(' ', '-');
  await mkdir('docs/screenshots/m3-02', { recursive: true });
  for (const [name, x, z, distance] of [
    ['near', -680, -450, 80],
    ['slope', -1100, -800, 110],
    ['far', -60, 0, 1800],
  ] as const) {
    await page.evaluate(
      ({ x, z, distance }) => window.__webcityCamera!.flyTo({ x, z }, distance),
      { x, z, distance },
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeCloseTo(distance, 1);
    await page.screenshot({
      path: `docs/screenshots/m3-02/${slug}-${name}.png`,
      scale: 'css',
    });
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.screenshot({
      path: 'docs/screenshots/m3-02/iPhone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
