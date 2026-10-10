import { expect, test, type Page } from '@playwright/test';
async function project(page: Page, x: number, z: number) {
  return page.evaluate(
    ({ x, z }) => {
      const camera = window.__webcityCamera!.camera,
        p = camera.position.clone().set(x, 58, z).project(camera);
      return {
        x: ((p.x + 1) * innerWidth) / 2,
        y: ((1 - p.y) * innerHeight) / 2,
      };
    },
    { x, z },
  );
}
async function tap(page: Page, x: number, z: number, touch: boolean) {
  const p = await project(page, x, z);
  expect(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, p),
  ).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
test('curved roads create visible rotated zoning and free strokes work on mouse and touch', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?play=1&quality=low&debug=1');
  const controls = page.locator('.road-controls');
  await expect(controls).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(850, 1);
  await page.evaluate(
    (desktop) =>
      window.__webcityCamera!.flyTo(
        desktop ? { x: -80, z: 0 } : { x: -160, z: -80 },
        1200,
      ),
    info.project.name === 'Desktop',
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 1200) < 0.1,
  );
  const touch = Boolean(info.project.use.hasTouch);
  await page
    .getByRole('combobox', { name: '鋪路模式', exact: true })
    .selectOption('curve');
  await tap(page, -240, -160, touch);
  await expect(controls).toHaveAttribute('data-phase', 'control');
  await tap(page, -240, 0, touch);
  await expect(controls).toHaveAttribute('data-phase', 'end');
  await tap(page, -80, 0, touch);
  if (touch) {
    await expect(controls).toHaveAttribute('data-valid', 'true');
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  }
  await expect(controls).toHaveAttribute('data-segments', '1');
  await page.waitForFunction(() => window.__webcityZoneStats!().blocks > 2);
  await page.waitForFunction(() => !window.__webcityRoadStats!().pending);
  await page.screenshot({
    path: `docs/screenshots/m2-01/${info.project.name === 'Desktop' ? 'desktop' : info.project.name === 'iPhone 15' ? 'iphone' : 'ipad'}.png`,
    scale: 'css',
  });
  await page
    .getByRole('combobox', { name: '鋪路模式', exact: true })
    .selectOption('free');
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -170, z: -245 }, 1200),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().z + 245) < 0.1,
  );
  const points = await Promise.all(
    [
      [-240, -240],
      [-210, -260],
      [-160, -260],
      [-110, -240],
    ].map(([x, z]) => project(page, x!, z!)),
  );
  for (const p of points)
    expect(
      await page.evaluate(
        (p) => document.elementFromPoint(p.x, p.y)?.tagName,
        p,
      ),
    ).toBe('CANVAS');
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [points[0]!],
    });
    for (const p of points.slice(1))
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [p],
      });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(controls).toHaveAttribute('data-valid', 'true');
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  } else {
    await page.mouse.move(points[0]!.x, points[0]!.y);
    await page.mouse.down();
    for (const p of points.slice(1))
      await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.mouse.up();
  }
  await expect(controls).toHaveAttribute('data-segments', '2');
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(
      page.getByRole('combobox', { name: '鋪路模式', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: 'docs/screenshots/m2-01/iphone-landscape.png',
      scale: 'css',
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
