import { expect, test } from '@playwright/test';
test('opens a populated city and navigates to real city viewpoints', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low&debug=1');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(Number(await canvas.getAttribute('data-buildings'))).toBeGreaterThan(
    200,
  );
  expect(Number(await canvas.getAttribute('data-chunks'))).toBe(100);
  await expect(page.getByText('展示街區；建造與經營功能開發中')).toBeVisible();
  for (const [name, distance] of [
    ['市中心', 950],
    ['河岸', 1000],
    ['全景', 2400],
  ] as const) {
    const button = page.getByRole('button', { name });
    const rect = await button.boundingBox();
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect
      .poll(
        () => page.evaluate(() => window.__webcityCamera!.readState().distance),
        { timeout: 15_000 },
      )
      .toBeCloseTo(distance, 2);
  }
  await page.getByRole('button', { name: '市中心' }).click();
  await expect
    .poll(
      () => page.evaluate(() => window.__webcityCamera!.readState().distance),
      { timeout: 15_000 },
    )
    .toBeCloseTo(950, 2);
  await page.screenshot({ path: info.outputPath('city.png'), scale: 'css' });
  expect(errors).toEqual([]);
});
