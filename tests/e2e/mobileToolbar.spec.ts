import { expect, test, type Page } from '@playwright/test';

async function fitsViewport(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    x: scrollX,
    y: scrollY,
  }));
  expect(dimensions.width).toBe(dimensions.viewportWidth);
  expect(dimensions.height).toBe(dimensions.viewportHeight);
  expect(dimensions.x).toBe(0);
  expect(dimensions.y).toBe(0);
}

test('touch toolbar has complete cards, an accessible tool overview and no page overflow', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?play=1&quality=low&debug=1');
  const toolbar = page.locator('.road-controls');
  await expect(toolbar).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  const tabs = page.locator('.road-tabs');
  const toggle = page.locator('.toolbar-toggle');
  if (info.project.name === 'Desktop') {
    await expect(toggle).toBeHidden();
    await fitsViewport(page);
    await page.screenshot({
      path: 'docs/screenshots/mobile-toolbar/desktop.jpg',
      scale: 'css',
      type: 'jpeg',
      quality: 75,
    });
    return;
  }
  // A native swipe scrolls the tool strip without moving the city camera.
  await expect.poll(() => tabs.evaluate((el) => el.scrollLeft)).toBe(0);
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 850) < 0.1,
  );
  const before = await page.evaluate(() => window.__webcityCamera!.readState());
  const bounds = (await tabs.boundingBox())!;
  const session = await context.newCDPSession(page);
  const y = bounds.y + bounds.height / 2;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, x: 340, y }],
  });
  for (let x = 320; x >= 60; x -= 20) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x, y }],
    });
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect
    .poll(() => tabs.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  const after = await page.evaluate(() => window.__webcityCamera!.readState());
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.z).toBeCloseTo(before.z, 1);
  await fitsViewport(page);
  const sizes =
    info.project.name === 'iPhone 15'
      ? [
          { width: 393, height: 852, name: 'iphone' },
          { width: 440, height: 956, name: 'iphone-large' },
          { width: 375, height: 667, name: 'iphone-small' },
          { width: 320, height: 568, name: 'iphone-se' },
          { width: 852, height: 393, name: 'iphone-landscape' },
        ]
      : [
          { width: 834, height: 1194, name: 'ipad' },
          { width: 1194, height: 834, name: 'ipad-landscape' },
        ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect(toggle).toBeVisible();
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.toolbar-content')).toBeHidden();
    const cards = await tabs.locator(':scope > button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.textContent,
          width: rect.width,
          height: rect.height,
          x: rect.x,
          right: rect.right,
          icon: !!button.querySelector(':scope > svg'),
          overflow: button.scrollWidth > button.clientWidth,
        };
      }),
    );
    expect(cards).toHaveLength(22);
    for (const card of cards) {
      expect(card.width).toBeGreaterThanOrEqual(44);
      expect(card.height).toBe(76);
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(size.width);
      expect(card.icon).toBe(true);
      expect(card.overflow, `${size.name}: ${card.label}`).toBe(false);
    }
    const rect = (await tabs.boundingBox())!;
    const hud = (await page.locator('.sim-controls').boundingBox())!;
    expect(rect.y).toBeGreaterThanOrEqual(hud.y + hud.height);
    expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
    await fitsViewport(page);
    await page.screenshot({
      path: `docs/screenshots/mobile-toolbar/${size.name}-tools.jpg`,
      scale: 'css',
      type: 'jpeg',
      quality: 75,
    });
    await tabs.getByRole('button', { name: '電力', exact: true }).tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.power-controls')).toBeVisible();
    await toggle.tap();
    await tabs.getByRole('button', { name: '探索城市', exact: true }).tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.toolbar-content')).toBeHidden();
    await fitsViewport(page);
    await page.screenshot({
      path: `docs/screenshots/mobile-toolbar/${size.name}-strip.jpg`,
      scale: 'css',
      type: 'jpeg',
      quality: 75,
    });
    if (size.name === 'iphone-landscape') {
      await toggle.tap();
      await tabs.getByRole('button', { name: '資訊圖層', exact: true }).tap();
      await expect(page.locator('.info-panel')).toBeVisible();
      await toggle.tap();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await tabs.getByRole('button', { name: '電力', exact: true }).tap();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.info-panel')).toBeHidden();
    }
  }
  expect(errors).toEqual([]);
});
