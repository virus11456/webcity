import { expect, test } from '@playwright/test';

test('shows the WebCity shell without overflow or browser errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/webcity\/$/);
  await expect(page).toHaveTitle('WebCity');
  await expect(
    page.getByRole('heading', { name: 'WebCity', exact: true }),
  ).toBeVisible();
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(20, 26, 34)',
  );
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);

  const layout = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect({ width: layout.width, height: layout.height }).toEqual(
    page.viewportSize(),
  );
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height);

  // outputPath isolates artifacts by project, test and retry to avoid collisions.
  const screenshot = testInfo.outputPath('shell.png');
  await page.screenshot({ path: screenshot, fullPage: true, scale: 'css' });
  await testInfo.attach('app-shell', {
    path: screenshot,
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
