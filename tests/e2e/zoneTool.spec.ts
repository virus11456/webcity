import { expect, test, type Page } from '@playwright/test';
async function point(page: Page, x: number, z: number) {
  return page.evaluate(
    ({ x, z }) => {
      const v = window
        .__webcityCamera!.camera.position.clone()
        .set(x, 58, z)
        .project(window.__webcityCamera!.camera);
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
async function setup(page: Page, touch: boolean) {
  await page.goto('./?quality=low&debug=1');
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
  await tap(page, -240, -80, touch);
  await tap(page, -80, -80, touch);
  if (touch)
    await page.getByRole('button', { name: '✔ 確認建造', exact: true }).tap();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '1',
  );
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await page.waitForFunction(
    () => window.__webcityZoneStats?.().pending === false,
  );
}
async function stroke(
  page: Page,
  touch: boolean,
  from: [number, number],
  to: [number, number],
  cancel = false,
) {
  const a = await point(page, ...from),
    b = await point(page, ...to);
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, ...a }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, ...b }],
    });
    if (cancel)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { id: 1, ...b },
          { id: 2, x: b.x + 40, y: b.y },
        ],
      });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
}

test('paints roadside residential/commercial/industrial zones, rejects locks and clears without charging', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const touch = Boolean(info.project.use.hasTouch);
  await setup(page, touch);
  const money = await page.locator('.road-controls').getAttribute('data-money');
  for (const value of ['RH', 'CH', 'O'])
    await expect(
      page.locator(`.zone-controls option[value="${value}"]`),
    ).toHaveJSProperty('disabled', true);
  expect(
    await page.evaluate(() => window.__webcityZoneStats!().instances),
  ).toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath('zones-empty.png'),
    scale: 'css',
  });
  await tap(page, -200, -100, touch);
  await expect
    .poll(() => page.evaluate(() => window.__webcityZoneStats!().codes[1] ?? 0))
    .toBeGreaterThan(20);
  await page.getByRole('combobox', { name: '分區種類' }).selectOption('CL');
  await tap(page, -200, -60, touch);
  await expect
    .poll(() => page.evaluate(() => window.__webcityZoneStats!().codes[3] ?? 0))
    .toBeGreaterThan(20);
  await page.getByRole('combobox', { name: '操作方式' }).selectOption('small');
  await page.getByRole('combobox', { name: '分區種類' }).selectOption('I');
  await stroke(page, touch, [-210, -100], [-130, -100]);
  await expect
    .poll(() => page.evaluate(() => window.__webcityZoneStats!().codes[5] ?? 0))
    .toBeGreaterThan(8);
  await page.waitForFunction(
    () => window.__webcityZoneStats?.().pending === false,
  );
  await page.screenshot({
    path: info.outputPath('zones-painted.png'),
    scale: 'css',
  });
  await page
    .getByRole('combobox', { name: '操作方式' })
    .selectOption('rectangle');
  await page.getByRole('combobox', { name: '分區種類' }).selectOption('clear');
  const before = await page.evaluate(
    () => window.__webcityZoneStats!().painted,
  );
  await stroke(page, touch, [-215, -120], [-175, -88]);
  await expect
    .poll(() => page.evaluate(() => window.__webcityZoneStats!().painted))
    .toBeLessThan(before);
  const after = await page.evaluate(() => window.__webcityZoneStats!().painted);
  await page.getByRole('combobox', { name: '操作方式' }).selectOption('large');
  await stroke(page, touch, [-205, -100], [-140, -100], true);
  expect(await page.evaluate(() => window.__webcityZoneStats!().painted)).toBe(
    after,
  );
  await expect(page.locator('.zone-controls')).toHaveAttribute(
    'data-selected',
    '0',
  );
  await stroke(page, touch, [-235, -104], [-85, -56]);
  await expect
    .poll(() => page.evaluate(() => window.__webcityZoneStats!().painted))
    .toBeLessThan(after);
  await page.getByRole('combobox', { name: '操作方式' }).selectOption('fill');
  await tap(page, -200, -60, touch);
  await page
    .getByRole('combobox', { name: '操作方式' })
    .selectOption('rectangle');
  await stroke(page, touch, [-245, -125], [-75, -35]);
  await expect
    .poll(() => page.evaluate(() => window.__webcityZoneStats!().painted))
    .toBe(0);
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-money',
    money!,
  );
  for (const control of await page
    .locator('.road-controls')
    .locator('button:visible, select:visible')
    .all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
});

test('keeps zoning controls usable on phone landscape', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'iPhone 15',
    'Landscape is covered once with touch',
  );
  await page.setViewportSize({ width: 852, height: 393 });
  await page.goto('./?quality=low&debug=1');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await page.getByRole('combobox', { name: '分區種類' }).selectOption('I');
  await page.getByRole('combobox', { name: '操作方式' }).selectOption('large');
  for (const control of await page
    .locator('.road-controls')
    .locator('button:visible, select:visible')
    .all()) {
    await control.scrollIntoViewIfNeeded(); // The compact toolbar scrolls horizontally.
    const b = (await control.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(852);
    expect(b.y + b.height).toBeLessThanOrEqual(393);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    393,
  );
  await page.screenshot({
    path: info.outputPath('zones-landscape.png'),
    scale: 'css',
  });
});
