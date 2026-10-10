import { expect, test } from '@playwright/test';

test('catalogs expose real costs, locks, tools and responsive construction controls', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?play=1&quality=low');
  const toolbar = page.locator('.road-controls');
  await expect(toolbar).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  const road = page.locator('.build-card[data-item="road_small"]');
  await expect(road).toHaveAttribute('aria-pressed', 'true');
  await expect(road).toContainText('造價 $20 / 8m');
  await expect(road).toContainText('維護 $0.16 / 8m / 週');
  await expect(
    page.locator('.build-card[data-item="road_medium"]'),
  ).toBeDisabled();
  await page.locator('.build-card[data-item="gravel"]').click();
  await expect(page.getByLabel('道路種類', { exact: true })).toHaveValue(
    'gravel',
  );
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await page.locator('.build-card[data-item="I"]').click();
  await expect(page.getByLabel('分區種類', { exact: true })).toHaveValue('I');
  await page.locator('.build-card[data-item="clear"]').click();
  await expect(page.getByLabel('分區種類', { exact: true })).toHaveValue(
    'clear',
  );
  await expect(page.locator('.build-card[data-item="RH"]')).toBeDisabled();
  await page.getByRole('button', { name: '電力', exact: true }).click();
  await expect(
    page.locator('.build-card[data-item="power_wind"]'),
  ).toContainText('$2,000');
  await page.locator('.build-card[data-item="line"]').click();
  await expect(page.getByLabel('電力設施', { exact: true })).toHaveValue(
    'line',
  );
  await page.getByRole('button', { name: '水務', exact: true }).click();
  await page.locator('.build-card[data-item="water_pump"]').click();
  await expect(page.locator('.water-controls')).toHaveAttribute(
    'data-mode',
    'water_pump',
  );
  const before = Number(
    await page.locator('.water-controls').getAttribute('data-rotation'),
  );
  await page.getByRole('button', { name: '旋轉 90°', exact: true }).click();
  await expect(page.locator('.water-controls')).not.toHaveAttribute(
    'data-rotation',
    String(before),
  );
  await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
  await page.locator('.toolbar-content').evaluate((e) => {
    e.scrollTop = 0;
  });
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPad Pro 11'
        ? 'ipad'
        : 'iphone';
  await page.screenshot({ path: `docs/screenshots/m1-21/${name}.png` });
  const rect = await toolbar.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (name === 'desktop') {
    await page.locator('canvas').focus();
    await page.keyboard.press('5');
    await expect(page.locator('.zone-controls')).toBeVisible();
    await page.keyboard.press('7');
    await expect(page.locator('.water-controls')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.water-controls')).toHaveAttribute(
      'data-cost',
      '0',
    );
    await page.keyboard.press('1');
    await expect(page.locator('.sim-controls')).toHaveAttribute(
      'data-speed',
      '1',
    );
  }
  if (name === 'iphone') {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(toolbar).toHaveAttribute('data-layout', 'phone-landscape');
    const tabs = await page.locator('.road-tabs').boundingBox();
    expect(tabs!.x).toBeLessThan(20);
    expect(tabs!.width).toBeLessThan(100);
    await page.getByRole('button', { name: '水務', exact: true }).tap();
    await expect(page.locator('.water-controls')).toBeVisible();
    await page.locator('.toolbar-content').evaluate((e) => {
      e.scrollTop = 0;
    });
    await page.screenshot({
      path: 'docs/screenshots/m1-21/iphone-landscape.png',
    });
  }
  expect(errors).toEqual([]);
});
