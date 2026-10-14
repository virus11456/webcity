import { expect, test, type Locator, type Page } from '@playwright/test';
async function activate(control: Locator, touch: boolean) {
  if (touch) await control.tap();
  else await control.click();
}
async function ready(page: Page, touch: boolean, quality = 'low') {
  await page.goto(`./?play=1&quality=${quality}&debug=1`);
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await activate(
    page.getByRole('button', { name: '暫停', exact: true }),
    touch,
  );
  await activate(
    page.getByRole('button', { name: '開始鋪路', exact: true }),
    touch,
  );
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-construction',
    'true',
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(850, 1);
  if (touch) await expect(page.getByRole('tooltip')).toBeHidden();
}
async function project(page: Page, x: number, z: number) {
  return page.evaluate(
    ({ x, z }) => {
      const camera = window.__webcityCamera!.camera;
      const v = camera.position.clone().set(x, 58, z).project(camera);
      return {
        x: ((v.x + 1) * innerWidth) / 2,
        y: ((1 - v.y) * innerHeight) / 2,
      };
    },
    { x, z },
  );
}
async function tap(page: Page, x: number, z: number, touch: boolean) {
  const point = await project(page, x, z);
  const target = await page.evaluate(
    (p) => document.elementFromPoint(p.x, p.y)?.tagName,
    point,
  );
  expect(target, `Road point (${x}, ${z}) must reach the canvas`).toBe(
    'CANVAS',
  );
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

test('builds, charges, continues and crosses roads through native pointer controls', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const touch = Boolean(info.project.use.hasTouch);
  await ready(page, touch);
  const controls = page.locator('.road-controls');
  await tap(page, -240, -80, touch);
  if (touch) await tap(page, -80, -80, true);
  else {
    const end = await project(page, -80, -80);
    await page.mouse.move(end.x, end.y);
  }
  await expect(controls).toHaveAttribute('data-valid', 'true');
  const price = Number(await controls.getAttribute('data-cost'));
  expect(price).toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath('road-preview.png'),
    scale: 'css',
  });
  if (touch)
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  else await tap(page, -80, -80, false);
  await expect(controls).toHaveAttribute('data-segments', '1');
  await page.waitForFunction(() => window.__webcityZoneStats?.().blocks === 2);
  expect(
    await page.evaluate(() => window.__webcityZoneStats!().valid),
  ).toBeGreaterThan(0);
  await expect(controls).toHaveAttribute('data-money', String(70000 - price));
  await expect(controls).toHaveAttribute('data-phase', 'end');
  await tap(page, -80, -240, touch);
  if (touch)
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  await expect(controls).toHaveAttribute('data-segments', '2');
  await activate(
    page.getByRole('button', { name: '✕ 取消路段', exact: true }),
    touch,
  );
  await tap(page, -160, -160, touch);
  await tap(page, -160, 0, touch);
  if (touch)
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  await expect(controls).toHaveAttribute('data-segments', '5');
  await page.waitForFunction(() => window.__webcityZoneStats?.().blocks === 10);
  expect(
    await page.evaluate(() => window.__webcityZoneStats!().invalid),
  ).toBeGreaterThan(0);
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  await page.waitForFunction(
    () => window.__webcityRoadStats?.().pending === false,
  );
  await page.screenshot({
    path: info.outputPath('road-built.png'),
    scale: 'css',
  });
  for (const button of await controls.getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.waitForFunction(
    () => window.__webcityRoadStats?.().pending === false,
  );
  expect(
    await page.evaluate(() => window.__webcityRoadStats!().batches),
  ).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => window.__webcityRoadStats!().batches),
  ).toBeLessThan(30);
  const money = await controls.getAttribute('data-money');
  await activate(
    page.getByRole('button', { name: '探索城市', exact: true }),
    touch,
  );
  await expect(controls).toHaveAttribute('data-active', 'false');
  await activate(
    page.getByRole('button', { name: '展示街區', exact: true }),
    touch,
  );
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-construction',
    'false',
  );
  await activate(
    page.getByRole('button', { name: '開始鋪路', exact: true }),
    touch,
  );
  await expect(controls).toHaveAttribute('data-segments', '5');
  await page.waitForFunction(() => window.__webcityZoneStats?.().blocks === 10);
  expect(
    await page.evaluate(() => window.__webcityZoneStats!().invalid),
  ).toBeGreaterThan(0);
  await expect(controls).toHaveAttribute('data-money', money!);
  expect(errors).toEqual([]);
});

test('rejects unowned land, cancels drafts and keeps touch camera gestures separate', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const touch = Boolean(info.project.use.hasTouch);
  await ready(page, touch);
  const controls = page.locator('.road-controls');
  await tap(page, -160, -80, touch);
  if (touch) {
    const session = await context.newCDPSession(page),
      center = await project(page, -120, -80);
    const distance = await page.evaluate(
      () => window.__webcityCamera!.readState().distance,
    );
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: center.x - 35, y: center.y },
        { id: 2, x: center.x + 35, y: center.y },
      ],
    });
    await expect(controls).toHaveAttribute('data-phase', 'start');
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: center.x - 50, y: center.y },
        { id: 2, x: center.x + 50, y: center.y },
      ],
    });
    await page.waitForTimeout(60);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeLessThan(distance);
    await session.detach();
  } else {
    await page.keyboard.press('Escape');
    await expect(controls).toHaveAttribute('data-phase', 'start');
    await tap(page, -160, -80, false);
    const end = await project(page, -80, -80);
    await page.mouse.click(end.x, end.y, { button: 'right' });
  }
  await expect(controls).toHaveAttribute('data-phase', 'start');
  await expect(controls).toHaveAttribute('data-segments', '0');
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -430, z: -80 }, 700),
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(700, 1);
  await tap(page, -430, -80, touch);
  await tap(page, -540, -80, touch);
  await expect(controls).toHaveAttribute('data-valid', 'false');
  await expect(controls.locator('.road-status')).toHaveText(
    '道路經過尚未購買的土地',
  );
  await expect(
    page.getByRole('button', { name: '確認建造', exact: true }),
  ).toBeDisabled();
  await expect(controls).toHaveAttribute('data-money', '70000');
  await page.screenshot({
    path: info.outputPath('road-invalid.png'),
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    // Let viewport and compositor surfaces settle before capturing the rotated device.
    await page.waitForTimeout(300);
    await page.screenshot({
      path: info.outputPath('road-landscape.png'),
      scale: 'css',
    });
    const confirmBox = (await page
      .getByRole('button', { name: '確認建造', exact: true })
      .boundingBox())!;
    expect(confirmBox.y + confirmBox.height).toBeLessThanOrEqual(393);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await activate(
    page.getByRole('button', { name: '✕ 取消路段', exact: true }),
    touch,
  );
  await expect(controls).toHaveAttribute('data-phase', 'start');
});

test('keeps detailed roads after restoring the WebGL context with shadows enabled', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const touch = Boolean(info.project.use.hasTouch);
  await ready(page, touch, touch ? 'medium' : 'high');
  await tap(page, -240, -80, touch);
  await tap(page, -80, -80, touch);
  if (touch)
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '1',
  );
  await page.waitForFunction(
    () => window.__webcityRoadStats?.().pending === false,
  );
  expect(
    await page.evaluate(() => window.__webcityRoadStats!().batches),
  ).toBeGreaterThan(0);
  await page.evaluate(() => {
    const extension = document
      .querySelector('canvas')!
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 500);
  });
  await expect(page.locator('.render-status')).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.render-status')).toBeHidden();
  await page.screenshot({
    path: info.outputPath('road-shadows.png'),
    scale: 'css',
  });
  expect(errors).toEqual([]);
});
