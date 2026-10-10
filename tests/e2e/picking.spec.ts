import { expect, test } from '@playwright/test';

test('debug picking follows terrain, reports cells, and keeps camera gestures separate', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?play=1&quality=low&debug=1');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  const panel = page.locator('.picking-debug');
  const viewport = page.viewportSize()!,
    x = viewport.width / 2,
    y = viewport.height / 2;
  const hit = await page.evaluate(({ x, y }) => window.__webcityPick!(x, y), {
    x,
    y,
  });
  expect(hit).not.toBeNull();
  expect(hit!.owned).toBe(true);
  if (info.project.name === 'Desktop') await page.mouse.move(x, y);
  else await page.touchscreen.tap(x, y);
  await expect(panel).toHaveAttribute('data-hit', 'true');
  await expect(panel).toHaveAttribute('data-cell', String(hit!.cell.index));
  if (info.project.name === 'Desktop') {
    await page.keyboard.press('Escape');
    await expect(panel).toHaveAttribute('data-hit', 'false');
  } else {
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: x - 30, y },
        { id: 2, x: x + 30, y },
      ],
    });
    await expect(panel).toHaveAttribute('data-hit', 'false');
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(panel).toHaveAttribute('data-hit', 'false');
  }
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -1100, z: -800 }, 300),
  );
  await expect
    .poll(
      () => page.evaluate(() => window.__webcityCamera!.readState().distance),
      { timeout: 15000 },
    )
    .toBeCloseTo(300, 2);
  if (info.project.name === 'Desktop') await page.mouse.move(x + 1, y);
  else await page.touchscreen.tap(x + 1, y);
  await expect(panel).toHaveAttribute('data-hit', 'true');
  await expect(panel).toHaveAttribute('data-owned', 'false');
  const projection = await page.evaluate(
    ({ x, y }) => {
      const hit = window.__webcityPick!(x, y)!;
      const camera = window.__webcityCamera!.camera;
      const v = camera.position
        .clone()
        .set(hit.world.x, hit.world.y, hit.world.z)
        .project(camera);
      return {
        x: ((v.x + 1) * innerWidth) / 2,
        y: ((1 - v.y) * innerHeight) / 2,
      };
    },
    { x: x + 1, y },
  );
  expect(Math.abs(projection.x - x - 1)).toBeLessThan(0.5);
  expect(Math.abs(projection.y - y)).toBeLessThan(0.5);
  await page.screenshot({
    path: info.outputPath('picking-slope.png'),
    scale: 'css',
  });
  expect(await page.evaluate(() => window.__webcityPick!(-10, -10))).toBeNull();
  await page.goto('./?play=1&quality=low');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.__webcityPick)).toBe(
    'undefined',
  );
  expect(errors).toEqual([]);
});
