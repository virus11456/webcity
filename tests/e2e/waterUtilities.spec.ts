import { utilityCity } from '../fixtures/utilityCity';
import { loadFixture } from './loadFixture';
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
test('supplies homes through powered water networks, validates shores and drains sewage on all devices', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const touch = !!info.project.use.hasTouch,
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadFixture(page, await utilityCity());
  expect(
    await page.evaluate(() => window.__webcityStats!()!.population),
  ).toBeGreaterThan(0);
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
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute(
    'data-underground',
    'false',
  );
  await page.locator('.bulldoze-controls select').selectOption('network');
  await fly(page, -80, -140);
  await tap(page, -80, -140, touch);
  await page.waitForFunction(
    () => window.__webcityStats!()!.water.served === 0,
  );
  expect(
    (await page.evaluate(() => window.__webcityStats!()!.water)).produced,
  ).toBe(6000);
  await page.locator('.bulldoze-controls select').selectOption('building');
  await fly(page, 374, 0);
  await tap(page, 374, 0, touch);
  await page.waitForFunction(
    () => window.__webcityStats!()!.sewage.capacity === 0,
  );
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.getByRole('button', { name: '水務', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '沿道路自動鋪水管', exact: true }),
    ).toBeVisible();
    const sizes = await page.locator('.road-tabs button').evaluateAll((bs) =>
      bs.map((b) => ({
        w: b.getBoundingClientRect().width,
        h: b.getBoundingClientRect().height,
      })),
    );
    expect(sizes.every((s) => s.w >= 44 && s.h >= 44)).toBe(true);
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
