import { test, expect, type Page } from '@playwright/test';
async function fly(page: Page, x: number, z: number, distance = 850) {
  await page.evaluate(
    ({ x, z, distance }) => window.__webcityCamera!.flyTo({ x, z }, distance),
    { x, z, distance },
  );
  await page.waitForFunction(
    ({ x, z, distance }) => {
      const s = window.__webcityCamera!.readState();
      return (
        Math.abs(s.x - x) < 0.1 &&
        Math.abs(s.z - z) < 0.1 &&
        Math.abs(s.distance - distance) < 0.1
      );
    },
    { x, z, distance },
  );
}
async function tap(page: Page, x: number, z: number, touch: boolean, y = 58) {
  const p = await page.evaluate(
    ({ x, y, z }) => {
      const v = window
        .__webcityCamera!.camera.position.clone()
        .set(x, y, z)
        .project(window.__webcityCamera!.camera);
      return {
        x: ((v.x + 1) * innerWidth) / 2,
        y: ((1 - v.y) * innerHeight) / 2,
      };
    },
    { x, y, z },
  );
  expect(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, p),
  ).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
test('shows building warnings, clears repaired timers, abandons and collapses without phantom residents', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const touch = !!info.project.use.hasTouch,
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?play=1&quality=high&debug=1');
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await fly(page, -120, -80);
  await tap(page, -240, -80, touch);
  await tap(page, -80, -80, touch);
  if (touch)
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  await page.waitForSelector('.road-controls[data-segments="1"]');
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await tap(page, -200, -100, touch);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.population > 0);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  await page.getByRole('button', { name: '水務', exact: true }).click();
  await tap(page, -80, -200, touch);
  await expect(page.locator('.water-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some((b) => b.defId === 'water_tower'),
  );
  expect(
    (await page.evaluate(() => window.__webcityStats!()!.water)).produced,
  ).toBe(0);
  await page.getByRole('button', { name: '電力', exact: true }).click();
  await tap(page, -80, -230, touch);
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(
    () => window.__webcityStats!()!.water.produced === 6000,
  );
  await page.getByRole('button', { name: '水務', exact: true }).click();
  await page
    .getByRole('button', { name: '沿道路自動鋪水管', exact: true })
    .click();
  await expect(page.locator('#app')).toHaveAttribute(
    'data-underground',
    'true',
  );
  const funds = Number(
      await page.locator('.road-controls').getAttribute('data-money'),
    ),
    cost = Number(
      await page.locator('.water-controls').getAttribute('data-cost'),
    );
  expect(cost).toBeGreaterThan(0);
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-money',
    String(funds - cost),
  );
  await page
    .getByRole('button', { name: '沿道路自動鋪水管', exact: true })
    .click();
  await expect(page.locator('.water-controls')).toHaveAttribute(
    'data-valid',
    'false',
  );
  await expect(
    page.getByRole('button', { name: '確認設置', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '取消預覽', exact: true }).click();
  await tap(page, -80, -192, touch);
  await tap(page, -80, -80, touch);
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.water.served! > 0);
  let stats = await page.evaluate(() => window.__webcityStats!()!);
  expect(stats.water.served).toBe(stats.water.consumed);
  expect(stats.sewage.treated).toBe(0);
  await page.screenshot({
    path: info.outputPath('water-underground.png'),
    scale: 'css',
  });
  await page
    .getByRole('combobox', { name: '水務設施' })
    .selectOption('water_pump');
  await tap(page, -40, -160, touch);
  await expect(page.locator('.water-controls')).toHaveAttribute(
    'data-valid',
    'false',
  );
  await expect(page.locator('.water-controls [role="status"]')).toContainText(
    '必須靠岸',
  );
  await expect(
    page.getByRole('button', { name: '確認設置', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('combobox', { name: '水務設施' })
    .selectOption('water_drain');
  await fly(page, 382, 0);
  await tap(page, 382, 0, touch, 58.25);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: '旋轉 90°', exact: true }).click();
  await expect(page.locator('.water-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  await page.screenshot({
    path: info.outputPath('water-shore-preview.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some((b) => b.defId === 'water_drain'),
  );
  expect(
    (await page.evaluate(() => window.__webcityStats!()!.sewage)).capacity,
  ).toBe(0);
  await page.getByRole('button', { name: '電力', exact: true }).click();
  await page.getByRole('combobox', { name: '電力設施' }).selectOption('line');
  await fly(page, -80, -210);
  await tap(page, -80, -220, touch);
  await fly(page, 374, 0);
  await tap(page, 374, 0, touch);
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(
    () => window.__webcityStats!()!.sewage.capacity === 30000,
  );
  expect(
    (await page.evaluate(() => window.__webcityStats!()!.sewage)).treated,
  ).toBe(0);
  await page.getByRole('button', { name: '水務', exact: true }).click();
  await page.getByRole('combobox', { name: '水務設施' }).selectOption('pipe');
  await tap(page, 374, 0, touch);
  await fly(page, -80, -80);
  await tap(page, -80, -80, touch);
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(
    () => window.__webcityStats!()!.sewage.treated! > 0,
  );
  stats = await page.evaluate(() => window.__webcityStats!()!);
  expect(stats.sewage.treated).toBe(stats.sewage.produced);
  expect(stats.sewage.uncollected).toBe(0);
  expect(stats.water.unserved).toBe(0);
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  // Power cable reaches the residential street; connect it so every zoned building is healthy.
  await page.getByRole('button', { name: '電力', exact: true }).click();
  await page.getByRole('combobox', { name: '電力設施' }).selectOption('line');
  await fly(page, -80, -140);
  await tap(page, -80, -210, touch);
  await tap(page, -200, -100, touch);
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(() =>
    window.__webcityBuildings!()
      .filter((b) => b.kind === 'zoned')
      .every((b) => b.flags === 7 && b.problemTimers.noPower === 0),
  );
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  await page.locator('.bulldoze-controls select').selectOption('building');
  await fly(page, -80, -225);
  await tap(page, -80, -225, touch);
  await page.waitForFunction(
    () => window.__webcityStats!()!.power.produced === 0,
  );
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await fly(page, -180, -90, 500);
  await page.waitForFunction(() => window.__webcityProblemIcons!().visible > 0);
  await page.locator('.problem-summary').click();
  await page.getByRole('button', { name: '查看問題建築', exact: true }).click();
  await expect(page.locator('.problem-detail')).toContainText('缺電');
  await page.locator('.problem-summary').click();
  await fly(page, -180, -90, 500);
  await page.screenshot({
    path: info.outputPath('problems-warning.png'),
    scale: 'css',
  });
  await fly(page, -180, -90, 2000);
  await page.waitForFunction(
    () => window.__webcityProblemIcons!().visible === 0,
  );
  await fly(page, -180, -90, 500);
  const target = await page.evaluate(
    () => window.__webcityBuildings!().find((b) => b.kind === 'zoned')!.id,
  );
  const failedAt = await page.evaluate(
    (id) =>
      window.__webcityBuildings!().find((b) => b.id === id)!.problemSinceTick!
        .noPower!,
    target,
  );
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(
    (id) =>
      window.__webcityBuildings!().find((b) => b.id === id)?.state ===
      'abandoned',
    target,
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  expect(
    await page.evaluate(
      (id) => window.__webcityBuildings!().find((b) => b.id === id)!.residents,
      target,
    ),
  ).toBe(0);
  const abandoned = await page.evaluate(
    (id) => window.__webcityBuildings!().find((b) => b.id === id)!,
    target,
  );
  expect(abandoned.problemTimers.noPower).toBeGreaterThanOrEqual(20);
  expect(abandoned.abandonedAtTick! - failedAt).toBeGreaterThanOrEqual(200);
  await page.waitForFunction(() => window.__webcityProblemIcons!().visible > 0);
  await page.screenshot({
    path: info.outputPath('problems-abandoned.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(
    (id) => !window.__webcityBuildings!().some((b) => b.id === id),
    target,
    { timeout: 60000 },
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.locator('.problem-summary').click();
    const size = await page
      .getByRole('button', { name: '查看問題建築', exact: true })
      .boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: info.outputPath('problems-landscape.png'),
      scale: 'css',
    });
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
