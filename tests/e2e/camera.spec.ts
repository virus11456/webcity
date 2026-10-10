import { expect, test } from '@playwright/test';

test('camera APIs preserve zoom anchors and animate the rendered view', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?play=1&quality=medium&debug=1');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  const zoom = await page.evaluate(async () => {
    const rig = window.__webcityCamera!;
    const ndc = { x: 0.35, y: -0.25 },
      point = rig.camera.position.clone();
    if (!rig.groundAt(ndc, point)) throw new Error('Expected ground anchor');
    const before = rig.readState().distance;
    rig.zoom(0.6, ndc);
    let worst = 0;
    const projection = point.clone();
    for (let i = 0; i < 30; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      projection.copy(point).project(rig.camera);
      worst = Math.max(
        worst,
        Math.abs(projection.x - ndc.x),
        Math.abs(projection.y - ndc.y),
      );
    }
    return { before, after: rig.readState().distance, worst };
  });
  expect(zoom.after).toBeLessThan(zoom.before);
  expect(zoom.worst).toBeLessThan(0.0001);
  const before = await page.evaluate(() => window.__webcityCamera!.readState());
  await page.evaluate(() => {
    const c = window.__webcityCamera!;
    c.pan(20, -15);
    c.rotate(0.25);
    c.tilt(0.1);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().azimuth),
    )
    .toBeCloseTo(before.azimuth + 0.25, 2);
  await expect
    .poll(() => page.evaluate(() => window.__webcityCamera!.readState().x))
    .toBeCloseTo(before.x + 20, 1);
  await page.evaluate(() => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 180));
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(180, 5);
  const final = await page.evaluate(() => {
    const c = window.__webcityCamera!;
    return { state: c.readState(), y: c.camera.position.y, fov: c.camera.fov };
  });
  expect(final.state.x).toBeCloseTo(0, 5);
  expect(final.state.z).toBeCloseTo(0, 5);
  expect(final.y).toBeGreaterThanOrEqual(5);
  expect(final.fov).toBe(45);
  const path = testInfo.outputPath('camera.png');
  await page.screenshot({ path, scale: 'css' });
  await testInfo.attach('camera', { path, contentType: 'image/png' });
  const viewport = page.viewportSize()!;
  await page.setViewportSize({
    width: viewport.height,
    height: viewport.width,
  });
  await expect
    .poll(() => page.evaluate(() => window.__webcityCamera!.camera.aspect))
    .toBeCloseTo(viewport.height / viewport.width);
  await page.screenshot({
    path: testInfo.outputPath('camera-rotated.png'),
    scale: 'css',
  });
  expect(errors).toEqual([]);
});
