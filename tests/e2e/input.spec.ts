import { expect, test, type Page } from '@playwright/test';
const state = (page: Page) =>
  page.evaluate(() => window.__webcityCamera!.readState());
async function ready(page: Page) {
  await page.goto('./?quality=medium&debug=1');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
}
test('mouse, keyboard, focus loss and optional edge scrolling', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'Desktop', 'Desktop controls');
  test.setTimeout(60_000);
  await ready(page);
  await page.locator('canvas').focus();
  const first = await state(page);
  await page.keyboard.down('w');
  await expect
    .poll(async () => (await state(page)).z)
    .toBeLessThan(first.z - 2);
  await page.keyboard.up('w');
  await page.mouse.move(650, 450);
  await page.mouse.down({ button: 'middle' });
  const pan = await state(page);
  await page.mouse.move(700, 450, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => (await state(page)).x).toBeLessThan(pan.x - 2);
  const rotate = await state(page);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(760, 450, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(async () => (await state(page)).azimuth)
    .toBeLessThan(rotate.azimuth - 0.2);
  await page.mouse.wheel(0, -150);
  await expect
    .poll(async () => (await state(page)).distance)
    .toBeLessThan(first.distance * 0.9);
  const tilt = await state(page);
  await page.keyboard.down('r');
  await expect
    .poll(async () => (await state(page)).elevation)
    .toBeGreaterThan(tilt.elevation + 0.05);
  await page.keyboard.up('r');
  await page.keyboard.down('d');
  await page.getByRole('checkbox').focus();
  await page.keyboard.up('d');
  await page.waitForTimeout(1000);
  const blurred = await state(page);
  await page.waitForTimeout(300);
  expect((await state(page)).x).toBeCloseTo(blurred.x, 1);
  await page.getByRole('checkbox').check();
  await page.locator('canvas').focus();
  await page.mouse.move(1435, 450);
  await expect
    .poll(async () => Math.abs((await state(page)).x - blurred.x))
    .toBeGreaterThan(2);
  await page.getByRole('checkbox').uncheck();
  await page.locator('canvas').focus();
  await page.mouse.move(1435, 450);
  await page.waitForTimeout(1000);
  const stopped = await state(page);
  await page.waitForTimeout(300);
  expect((await state(page)).x).toBeCloseTo(stopped.x, 1);
  await page.screenshot({ path: info.outputPath('input.png'), scale: 'css' });
});
test('native touch drag, pinch, rotate, tilt and viewport stability', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name === 'Desktop', 'Touch devices');
  test.setTimeout(60_000);
  await ready(page);
  const session = await context.newCDPSession(page);
  const send = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { id: number; x: number; y: number }[],
  ) => {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points,
    });
  };
  const first = await state(page);
  await send('touchStart', [{ id: 1, x: 120, y: 400 }]);
  await send('touchMove', [{ id: 1, x: 165, y: 400 }]);
  await send('touchEnd', []);
  await expect
    .poll(async () => (await state(page)).x)
    .toBeLessThan(first.x - 1);
  const pair = [
    { id: 1, x: 100, y: 400 },
    { id: 2, x: 280, y: 400 },
  ];
  await send('touchStart', pair);
  for (let d = 4; d <= 40; d += 4)
    await send('touchMove', [
      { id: 1, x: 100 - d, y: 400 },
      { id: 2, x: 280 + d, y: 400 },
    ]);
  await send('touchEnd', []);
  await expect
    .poll(async () => (await state(page)).distance)
    .toBeLessThan(first.distance * 0.8);
  const rotated = await state(page);
  await send('touchStart', pair);
  for (let d = 4; d <= 50; d += 4)
    await send('touchMove', [
      { id: 1, x: 100, y: 400 - d },
      { id: 2, x: 280, y: 400 + d },
    ]);
  await send('touchEnd', []);
  await expect
    .poll(async () => (await state(page)).azimuth)
    .toBeLessThan(rotated.azimuth - 0.2);
  const tilted = await state(page);
  await send('touchStart', pair);
  for (let d = 4; d <= 50; d += 4)
    await send(
      'touchMove',
      pair.map((p) => ({ ...p, y: p.y + d })),
    );
  await send('touchEnd', []);
  await expect
    .poll(async () => (await state(page)).elevation)
    .toBeGreaterThan(tilted.elevation + 0.1);
  const viewport = await page.evaluate(() => ({
    scale: visualViewport!.scale,
    x: scrollX,
    y: scrollY,
    width: document.documentElement.scrollWidth,
    inner: innerWidth,
  }));
  expect(viewport).toEqual({
    scale: 1,
    x: 0,
    y: 0,
    width: viewport.inner,
    inner: viewport.inner,
  });
  await page.screenshot({ path: info.outputPath('input.png'), scale: 'css' });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect
      .poll(() => page.evaluate(() => window.__webcityCamera!.camera.aspect))
      .toBeCloseTo(852 / 393);
    await page.screenshot({
      path: info.outputPath('input-landscape.png'),
      scale: 'css',
    });
  }
});
