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
  await fly(page, x, z);
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
test.use({
  actionTimeout: 10000,
  video: { mode: 'on', size: { width: 960, height: 600 } },
});
test('M1 complete city: menu roads zones utilities population and save restore', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const touch = !!info.project.use.hasTouch;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low&debug=1');
  await page.getByRole('button', { name: '新遊戲', exact: true }).click();
  await page.getByLabel('城市名稱', { exact: true }).fill('M1 河谷市');
  await page.getByRole('button', { name: '開始建城', exact: true }).click();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  const initial = Number(
    await page.locator('.road-controls').getAttribute('data-segments'),
  );
  expect(initial).toBeGreaterThan(6);
  async function road(ax: number, az: number, bx: number, bz: number) {
    await page.getByRole('button', { name: '探索城市', exact: true }).click();
    await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
    const count = Number(
      await page.locator('.road-controls').getAttribute('data-segments'),
    );
    await fly(page, ax, az);
    await tap(page, ax, az, touch);
    await fly(page, bx, bz);
    await tap(page, bx, bz, touch);
    if (touch)
      await page.getByRole('button', { name: '✔ 確認建造', exact: true }).tap();
    await expect
      .poll(async () =>
        Number(
          await page.locator('.road-controls').getAttribute('data-segments'),
        ),
      )
      .toBeGreaterThan(count);
  }
  // Connect the city grid to the prebuilt ramp, then give homes and jobs road frontage.
  await road(-288, -192, -240, -80);
  await road(-240, -80, 160, -80);
  await road(-240, 80, 160, 80);
  await road(160, -80, 160, 80);
  await page.getByRole('button', { name: '分區', exact: true }).click();
  for (const z of [-100, -60, 60, 100]) {
    await fly(page, -80, z);
    await tap(page, -80, z, touch);
    await page.waitForFunction(() => !window.__webcityZoneStats!().pending);
  }
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
  await page.screenshot({
    path: info.outputPath('water-connected.png'),
    scale: 'css',
  });

  await page.getByRole('button', { name: '電力', exact: true }).click();
  await page
    .getByRole('combobox', { name: '電力設施' })
    .selectOption('power_wind');
  for (const z of [-300, -370]) {
    await tap(page, -80, z, touch);
    await expect(
      page.getByRole('button', { name: '確認設置', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '確認設置', exact: true }).click();
  }
  await page.getByRole('combobox', { name: '電力設施' }).selectOption('line');
  for (const [ax, az, bx, bz] of [
    [-80, -380, -80, 104],
    [-240, -104, 160, -104],
    [-240, -56, 160, -56],
    [-240, 56, 160, 56],
    [-240, 104, 160, 104],
  ]) {
    await fly(page, ax!, az!);
    await tap(page, ax!, az!, touch);
    await fly(page, bx!, bz!);
    await tap(page, bx!, bz!, touch);
    await expect(
      page.getByRole('button', { name: '確認設置', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '確認設置', exact: true }).click();
  }
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(
    () => window.__webcityStats!()!.population > 200,
    null,
    { timeout: 45000 },
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  const before = await page.evaluate(() => ({
    stats: window.__webcityStats!(),
    buildings: window.__webcityBuildings!(),
    zones: window.__webcityZoneStats!().painted,
  }));
  expect(before.stats!.power.unpowered).toBe(0);
  expect(before.stats!.water.unserved).toBe(0);
  expect(before.stats!.sewage.uncollected).toBe(0);
  await fly(page, -80, 0, 1100);
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPad Pro 11'
        ? 'ipad'
        : 'iphone';
  await page.screenshot({
    path: `docs/screenshots/m1-26/${name}.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '存檔與讀檔', exact: true }).click();
  await page
    .locator('[data-slot="0"]')
    .getByRole('button', { name: '儲存', exact: true })
    .click();
  await expect(page.locator('[data-slot="0"] img')).toBeVisible();
  await page.reload();
  await expect(page.locator('.main-menu')).toBeVisible();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  const after = await page.evaluate(() => ({
    stats: window.__webcityStats!(),
    buildings: window.__webcityBuildings!(),
    zones: window.__webcityZoneStats!().painted,
  }));
  // MessagePack canonicalizes -0 to 0 and omits optional undefined fields.
  expect(JSON.parse(JSON.stringify(after))).toEqual(
    JSON.parse(JSON.stringify(before)),
  );
  expect(errors).toEqual([]);
});
