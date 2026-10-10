import { expect, test } from '@playwright/test';

test('river shader animates with a stationary camera without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./?play=1&quality=medium&debug=1');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '河岸', exact: true }).click();
  await expect
    .poll(
      () => page.evaluate(() => window.__webcityCamera!.readState().distance),
      { timeout: 15000 },
    )
    .toBeCloseTo(1000, 2);
  await page.addStyleTag({
    content: '.debug-panel { display: none !important; }',
  });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => window.__webcityCamera!.readState());
  const before = await page.locator('canvas').screenshot();
  await page.waitForTimeout(1000);
  const after = await page.locator('canvas').screenshot();
  expect(
    await page.evaluate(() => window.__webcityCamera!.readState()),
  ).toEqual(state);
  expect(before.equals(after)).toBe(false);
  expect(errors).toEqual([]);
});
