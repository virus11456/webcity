import { expect, test, type Page } from '@playwright/test';
async function point(page: Page, x: number, z: number) {
  return page.evaluate(
    ({ x, z }) => {
      const c = window.__webcityCamera!.camera,
        v = c.position.clone().set(x, 58, z).project(c);
      return {
        x: ((v.x + 1) * innerWidth) / 2,
        y: ((1 - v.y) * innerHeight) / 2,
      };
    },
    { x, z },
  );
}
async function tap(page: Page, x: number, z: number, touch: boolean) {
  const p = await point(page, x, z);
  expect(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, p),
  ).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function setup(page: Page) {
  await page.goto('./?play=1&quality=low&debug=1');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(850, 1);
}
async function road(
  page: Page,
  touch: boolean,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
  await tap(page, ax, az, touch);
  await tap(page, bx, bz, touch);
  if (touch)
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-pending',
    'false',
  );
  await page.getByRole('button', { name: '✕ 取消路段', exact: true }).click();
}

test('previews, cancels, removes an arm and an entire junction with exact refunds and zone cleanup', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const touch = Boolean(info.project.use.hasTouch);
  await setup(page);
  await road(page, touch, -240, -80, -80, -80);
  await road(page, touch, -160, -160, -160, 0);
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '4',
  );
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-money',
    '69200',
  );
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await tap(page, -210, -100, touch);
  await expect
    .poll(() => page.evaluate(() => window.__webcityZoneStats!().painted))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  const p = await point(page, -210, -80),
    panel = page.locator('.bulldoze-controls');
  const session = touch ? await context.newCDPSession(page) : null;
  if (session)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, ...p }],
    });
  else {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
  }
  await expect(panel).toHaveAttribute('data-selected', '1');
  await expect(panel).toHaveAttribute('data-refund', '200');
  await page.screenshot({
    path: info.outputPath('bulldoze-preview.png'),
    scale: 'css',
  });
  if (session) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, ...p },
        { id: 2, x: p.x + 40, y: p.y },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } else {
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  await expect(panel).toHaveAttribute('data-selected', '0');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '4',
  );
  await tap(page, -210, -80, touch);
  await expect(panel).toHaveAttribute('data-last-refund', '200');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '3',
  );
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-money',
    '69400',
  );
  await page.waitForFunction(
    () =>
      !window.__webcityRoadStats!().pending &&
      !window.__webcityZoneStats!().pending,
  );
  expect(await page.evaluate(() => window.__webcityZoneStats!().painted)).toBe(
    0,
  );
  await page.screenshot({
    path: info.outputPath('bulldoze-after.png'),
    scale: 'css',
  });
  await tap(page, -160, -80, touch);
  await expect(panel).toHaveAttribute('data-last-refund', '600');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '0',
  );
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-money',
    '70000',
  );
  await page.waitForFunction(
    () =>
      !window.__webcityRoadStats!().pending &&
      !window.__webcityZoneStats!().pending,
  );
  expect(await page.evaluate(() => window.__webcityZoneStats!().blocks)).toBe(
    0,
  );
  expect(await page.evaluate(() => window.__webcityRoadStats!().batches)).toBe(
    0,
  );
  await road(page, touch, -240, -120, -80, -120);
  await road(page, touch, -240, -40, -80, -40);
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  const a = await point(page, -200, -150),
    b = await point(page, -200, -20);
  if (session) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, ...a }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, ...b }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } else {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 2 });
    await page.mouse.up();
  }
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '0',
  );
  await expect(panel).toHaveAttribute('data-removed', '2');
  await expect(panel).toHaveAttribute('data-last-refund', '800');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-money',
    '70000',
  );
  for (const control of await page
    .locator('.road-controls')
    .locator('button:visible,select:visible')
    .all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: info.outputPath('bulldoze-landscape.png'),
      scale: 'css',
    });
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(393);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  await session?.detach();
  expect(errors).toEqual([]);
});

test('an old road can be removed while paused without a refund', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await setup(page);
  await road(page, Boolean(info.project.use.hasTouch), -240, -80, -80, -80);
  const builtDay = Number(
    await page.locator('.sim-controls').getAttribute('data-day'),
  );
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await expect
    .poll(
      async () =>
        Number(await page.locator('.sim-controls').getAttribute('data-day')),
      { timeout: 15000 },
    )
    .toBeGreaterThanOrEqual(builtDay + 7);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  await tap(page, -200, -80, Boolean(info.project.use.hasTouch));
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '0',
  );
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-money',
    String(69600 - (160 / 8) * 0.16), // One week of upkeep, no demolition refund.
  );
  await expect(page.locator('.bulldoze-controls')).toHaveAttribute(
    'data-last-refund',
    '0',
  );
});
