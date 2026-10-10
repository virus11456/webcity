import { test, expect } from '@playwright/test';
test('starts a named city, applies settings, pauses, saves and continues on every layout', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(
    page.getByRole('button', { name: '繼續最近的城市', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPad Pro 11'
        ? 'ipad'
        : 'iphone';
  await page.screenshot({
    path: `docs/screenshots/m1-25/${name}.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '新遊戲', exact: true }).click();
  await page.getByLabel('城市名稱', { exact: true }).fill('河灣新城');
  await page
    .getByRole('combobox', { name: '地圖', exact: true })
    .selectOption('bay');
  await page
    .getByRole('combobox', { name: '遊戲模式', exact: true })
    .selectOption('sandbox');
  await page.getByRole('button', { name: '開始建城', exact: true }).click();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-construction',
    'true',
  );
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await expect(page.locator('.pause-dialog')).toBeVisible();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  await page.locator('.pause-dialog summary').click();
  await page.locator('.pause-dialog select').selectOption('low');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('webcity-preferences') ?? '{}')
            .quality,
      ),
    )
    .toBe('low');
  await page
    .getByRole('button', { name: '儲存並回主選單', exact: true })
    .click();
  await expect(page.locator('.main-menu')).toBeVisible();
  await expect(page.locator('.menu-card')).toContainText('河灣新城');
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-construction',
    'true',
  );
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.getByRole('button', { name: '暫停選單', exact: true }).click();
    await page.screenshot({
      path: 'docs/screenshots/m1-25/iphone-landscape.png',
      scale: 'css',
    });
    await page.getByRole('button', { name: '返回城市', exact: true }).click();
  }
  expect(errors).toEqual([]);
});
