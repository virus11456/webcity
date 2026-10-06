import { test, expect, type Page } from '@playwright/test';
async function tap(page: Page, x: number, z: number, touch: boolean) {
  const p = await page.evaluate(
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
  expect(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, p),
  ).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
test('roadside zones grow, pause, finish construction and rezone through native controls', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const touch = Boolean(info.project.use.hasTouch);
  await page.goto('./?quality=high&debug=1');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
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
  await tap(page, -200, -100, touch);
  await page.getByRole('combobox', { name: '分區種類' }).selectOption('CL');
  await tap(page, -200, -60, touch);
  expect(await page.evaluate(() => window.__webcityBuildings!().length)).toBe(
    0,
  );
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__webcityBuildings!().filter((b) => b.state === 'construction')
            .length,
      ),
    )
    .toBeGreaterThan(3);
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some(
      (b) => b.state === 'construction' && b.stateTimer >= 1.5,
    ),
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  const paused = await page.evaluate(() => window.__webcityBuildings!());
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__webcityBuildings!())).toEqual(
    paused,
  );
  await page.getByRole('button', { name: '查看建築', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(220, 1);
  await page.waitForFunction(
    () => window.__webcityBuildingStats!().detail === 4,
  );
  await page.screenshot({
    path: info.outputPath('growth-construction.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__webcityBuildings!().filter((b) => b.state === 'active')
              .length,
        ),
      { timeout: 12_000 },
    )
    .toBeGreaterThan(3);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__webcityBuildings!().filter(
              (b) => b.state === 'construction',
            ).length,
        ),
      { timeout: 12_000 },
    )
    .toBe(0);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.__webcityBuildings!().some((b) => b.defId === 'RL'),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      window.__webcityBuildings!().some((b) => b.defId === 'CL'),
    ),
  ).toBe(true);
  await page.waitForFunction(
    () => window.__webcityBuildingStats!().detail === 16,
  );
  await page.screenshot({
    path: info.outputPath('growth-complete.png'),
    scale: 'css',
  });
  // Return to the original road view, then erase the occupied residential block.
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -120, z: -80 }, 850),
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(850, 1);
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await page.getByRole('combobox', { name: '分區種類' }).selectOption('clear');
  await tap(page, -200, -100, touch);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__webcityBuildings!().filter(
            (b) => b.rezoneAtTick !== undefined,
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const scheduled = await page.evaluate(() =>
    window.__webcityBuildings!()
      .filter((b) => b.rezoneAtTick !== undefined)
      .map((b) => b.id),
  );
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          (ids) =>
            window.__webcityBuildings!().filter((b) => ids.includes(b.id))
              .length,
          scheduled,
        ),
      { timeout: 10_000 },
    )
    .toBe(0);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  expect(errors).toEqual([]);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    const sizes = await page
      .locator('.growth-controls button')
      .evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            font: parseFloat(getComputedStyle(e).fontSize),
          };
        }),
      );
    for (const s of sizes) {
      expect(s.w).toBeGreaterThanOrEqual(44);
      expect(s.h).toBeGreaterThanOrEqual(44);
      expect(s.font).toBeGreaterThanOrEqual(12);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  }
});
