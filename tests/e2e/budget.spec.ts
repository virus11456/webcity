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
test('tax changes reach next settlement and detailed ledger on real housing', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const touch = Boolean(info.project.use.hasTouch);
  await page.goto('./?play=1&quality=low&debug=1');
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 850) < 0.1,
  );
  await tap(page, -240, -80, touch);
  await tap(page, -80, -80, touch);
  if (touch)
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '1',
  );
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await page.waitForFunction(() => !window.__webcityZoneStats!().pending);
  await tap(page, -200, -100, touch);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.population > 20);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '財政', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '財政', exact: true });
  await dialog.locator('summary').filter({ hasText: '分區稅率' }).click();
  const slider = dialog.getByRole('slider', {
    name: '低密度住宅',
    exact: true,
  });
  await slider.fill('1');
  await slider.dispatchEvent('change');
  await expect(dialog.locator('.finance-message')).toHaveText('已套用');
  await dialog.getByRole('button', { name: '關閉財政', exact: true }).click();
  let day = await page.evaluate(() => window.__webcityStats!()!.day);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(
    (day) => window.__webcityStats!()!.day >= day + 7,
    day,
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '財政', exact: true }).click();
  await dialog.locator('summary').filter({ hasText: '每週收支明細' }).click();
  const lowIncome = Number(
    (await dialog
      .locator('[data-field="taxIncome.RL"]')
      .textContent())!.replace(/[$,]/g, ''),
  );
  expect(lowIncome).toBeGreaterThan(0);
  const demand = await page.evaluate(() => window.__webcityStats!()!.demand.R);
  await slider.fill('20');
  await slider.dispatchEvent('change');
  await expect(slider).toHaveValue('20');
  await dialog.getByRole('button', { name: '關閉財政', exact: true }).click();
  day = await page.evaluate(() => window.__webcityStats!()!.day);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(
    (day) => window.__webcityStats!()!.day >= day + 7,
    day,
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  expect(
    await page.evaluate(() => window.__webcityStats!()!.demand.R),
  ).toBeLessThan(demand);
  await page.getByRole('button', { name: '財政', exact: true }).click();
  const text = await dialog
    .locator('[data-field="taxIncome.RL"]')
    .textContent();
  expect(Number(text!.replace(/[$,]/g, ''))).toBeGreaterThan(lowIncome);
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPad Pro 11'
        ? 'ipad'
        : 'iphone';
  await dialog.locator('summary').filter({ hasText: '分區稅率' }).click();
  await dialog.evaluate((d) => {
    d.scrollTop = 0;
  });
  await page.screenshot({
    path: `docs/screenshots/m1-23/${name}.png`,
    scale: 'css',
  });
});
