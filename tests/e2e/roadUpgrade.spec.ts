import { expect, test } from '@playwright/test';
test('upgrades roads for the price difference and reverses one-way roads with mouse and touch', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?play=1&quality=low&debug=1');
  const controls = page.locator('.road-controls');
  await expect(controls).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(850, 1);
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -160, z: -80 }, 1200),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 1200) < 0.1,
  );
  const touch = Boolean(info.project.use.hasTouch),
    type = page.getByRole('combobox', { name: '道路種類', exact: true }),
    mode = page.getByRole('combobox', { name: '鋪路模式', exact: true });
  const tap = async (x: number, z: number) => {
    const p = await page.evaluate(
      ({ x, z }) => {
        const c = window.__webcityCamera!.camera,
          p = c.position.clone().set(x, 58, z).project(c);
        return {
          x: ((p.x + 1) * innerWidth) / 2,
          y: ((1 - p.y) * innerHeight) / 2,
        };
      },
      { x, z },
    );
    expect(
      await page.evaluate(
        (p) => document.elementFromPoint(p.x, p.y)?.tagName,
        p,
      ),
    ).toBe('CANVAS');
    if (touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const confirm = async () => {
    if (touch) {
      await expect(controls).toHaveAttribute('data-valid', 'true');
      await page.getByRole('button', { name: '✔ 確認建造', exact: true }).tap();
    }
    await expect(controls).toHaveAttribute('data-pending', 'false');
  };
  await type.selectOption('gravel');
  await tap(-240, -160);
  await tap(-80, -160);
  await confirm();
  await expect(controls).toHaveAttribute('data-segments', '1');
  const before = Number(await controls.getAttribute('data-money'));
  await mode.selectOption('upgrade');
  await type.selectOption('road_small');
  await tap(-160, -160);
  if (touch) {
    await expect(controls).toHaveAttribute('data-cost', '240');
    await expect(controls).toHaveAttribute('data-money', String(before));
  }
  await confirm();
  await expect(controls).toHaveAttribute('data-money', String(before - 240));
  await type.selectOption('road_small_oneway');
  await tap(-160, -160);
  await confirm();
  await tap(-160, -160);
  await confirm();
  await expect(controls).toHaveAttribute('data-money', String(before - 240));
  await expect(controls).toHaveAttribute('data-segments', '1');
  await page.waitForFunction(() => !window.__webcityRoadStats!().pending);
  await page.screenshot({
    path: `docs/screenshots/m2-03/${info.project.name === 'Desktop' ? 'desktop' : info.project.name === 'iPhone 15' ? 'iphone' : 'ipad'}.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(mode).toBeVisible();
    await page.screenshot({
      path: 'docs/screenshots/m2-03/iphone-landscape.png',
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
