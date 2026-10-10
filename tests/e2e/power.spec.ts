import { utilityCity } from '../fixtures/utilityCity';
import { loadFixture } from './loadFixture';
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
test('wind placement, rotation, power lines and demolition update real electricity', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const touch = Boolean(info.project.use.hasTouch),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadFixture(page, await utilityCity());
  expect(
    await page.evaluate(() => window.__webcityStats!()!.population),
  ).toBeGreaterThan(0);
  expect(
    (await page.evaluate(() => window.__webcityStats!()!.power)).unpowered,
  ).toBeGreaterThan(0);
  await page.getByRole('button', { name: '電力', exact: true }).click();
  await tap(page, -80, -220, touch);
  await expect(page.locator('.power-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  const expected = Number(
    await page.locator('.power-controls').getAttribute('data-output'),
  );
  expect(expected).toBeGreaterThan(0);
  expect(expected).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: '旋轉 90°', exact: true }).click();
  await page.screenshot({
    path: info.outputPath('power-preview.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(() =>
    window.__webcityBuildings!().some((b) => b.defId === 'power_wind'),
  );
  const plant = await page.evaluate(() =>
    window.__webcityBuildings!().find((b) => b.defId === 'power_wind')!,
  );
  expect(plant.rotation).toBeCloseTo(Math.PI / 2);
  expect(plant.paidCost).toBe(2000);
  expect(
    (await page.evaluate(() => window.__webcityStats!()!.power)).produced,
  ).toBeCloseTo(expected, 5);
  expect(
    (await page.evaluate(() => window.__webcityStats!()!.power)).served,
  ).toBe(0);
  await page.getByRole('combobox', { name: '電力設施' }).selectOption('line');
  await tap(page, -72, -215, touch);
  await tap(page, -150, -100, touch);
  await expect(page.locator('.power-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.power.served! > 0);
  let power = await page.evaluate(() => window.__webcityStats!()!.power);
  expect(power.served).toBeCloseTo(power.consumed);
  expect(power.unpowered).toBe(0);
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  const viewDistance = info.project.name === 'iPhone 15' ? 750 : 450;
  await page.evaluate(
    (distance) => window.__webcityCamera!.flyTo({ x: -130, z: -140 }, distance),
    viewDistance,
  );
  await page.waitForFunction(
    (distance) =>
      Math.abs(window.__webcityCamera!.readState().distance - distance) < 0.1,
    viewDistance,
  );
  await page.screenshot({
    path: info.outputPath('power-connected.png'),
    scale: 'css',
  });
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -120, z: -80 }, 850),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 850) < 0.1,
  );
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  await page.locator('.bulldoze-controls select').selectOption('network');
  await tap(page, -111, -157.5, touch);
  await page.waitForFunction(
    () => window.__webcityStats!()!.power.served === 0,
  );
  power = await page.evaluate(() => window.__webcityStats!()!.power);
  expect(power.produced).toBeGreaterThan(0);
  expect(power.unpowered).toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath('power-disconnected.png'),
    scale: 'css',
  });
  await page.locator('.bulldoze-controls select').selectOption('building');
  await tap(page, plant.pos.x + 8, plant.pos.z, touch);
  await page.waitForFunction(
    () => window.__webcityStats!()!.power.produced === 0,
  );
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.getByRole('button', { name: '電力', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '旋轉 90°', exact: true }),
    ).toBeVisible();
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
