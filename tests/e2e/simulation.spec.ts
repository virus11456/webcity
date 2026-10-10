import { expect, test } from '@playwright/test';

test('worker clock pauses and changes speed through controls, including offline', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const workerReady = page.waitForEvent('worker');
  await page.goto('./?play=1&quality=low&debug=1');
  const worker = await workerReady;
  expect(worker.url()).toContain('worker-');
  const controls = page.getByRole('region', { name: '模擬速度' });
  await expect(controls).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  const ticks = async () => Number(await controls.getAttribute('data-ticks'));
  const press = async (name: string) => {
    const button = controls.getByRole('button', { name, exact: true });
    if (info.project.use.hasTouch) await button.tap();
    else await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  };
  await press('暫停');
  const paused = await ticks();
  const date = controls.locator('time');
  const frozenDate = await date.getAttribute('datetime');
  const day = Number(await controls.getAttribute('data-day'));
  expect(frozenDate).toBe(
    new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10),
  );
  await page.waitForTimeout(700);
  expect(await ticks()).toBe(paused);
  await expect(date).toHaveAttribute('datetime', frozenDate!);
  // Camera exploration remains interactive while simulation is paused.
  const before = await page.evaluate(
    () => window.__webcityCamera!.readState().distance,
  );
  await page.getByRole('button', { name: '全景', exact: false }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .not.toBe(before);
  expect(await ticks()).toBe(paused);
  for (const label of ['×1', '×2', '×4']) {
    await press(label);
    const start = await ticks();
    await expect.poll(ticks).toBeGreaterThan(start);
  }
  const fastDay = Number(await controls.getAttribute('data-day'));
  await expect
    .poll(async () => Number(await controls.getAttribute('data-day')))
    .toBeGreaterThan(fastDay);
  await press('暫停');
  if (info.project.name === 'Desktop') {
    await page.locator('canvas').focus();
    await page.keyboard.press('Digit3');
    await expect(controls).toHaveAttribute('data-speed', '4');
    await page.keyboard.press('Space');
    await expect(controls).toHaveAttribute('data-speed', '0');
  }
  await page.getByRole('button', { name: '市中心', exact: false }).click();
  await page.waitForTimeout(1200);
  for (const button of await controls.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: info.outputPath('simulation.png'),
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await press('×2');
    await page.screenshot({
      path: info.outputPath('simulation-landscape.png'),
      scale: 'css',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(controls).toHaveAttribute('data-ready', 'true');
  const restarted = await ticks();
  await expect.poll(ticks).toBeGreaterThan(restarted);
  await press('暫停');
  const offlinePaused = await ticks();
  await page.waitForTimeout(500);
  expect(await ticks()).toBe(offlinePaused);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
