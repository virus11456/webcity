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
test('inspect actual assets, show read-only details and dismiss selection', async ({
  page,
}, info) => {
  const touch = Boolean(info.project.use.hasTouch);
  await page.goto('./?quality=low&debug=1');
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 850) < 0.1,
  );
  await tap(page, -240, -80, touch);
  await tap(page, -80, -80, touch);
  if (touch)
    await page.getByRole('button', { name: '✔ 確認建造', exact: true }).tap();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '1',
  );
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await tap(page, -160, -80, touch);
  await expect(page.locator('.inspect-data')).toHaveAttribute(
    'data-kind',
    'segment',
  );
  await expect(page.locator('.inspect-data')).toContainText('長度');
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
  await page.getByRole('button', { name: '電力', exact: true }).click();
  await tap(page, -80, -220, touch);
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await tap(page, -80, -216, touch);
  await expect(page.locator('.inspect-data')).toHaveAttribute(
    'data-kind',
    'building',
  );
  await expect(page.locator('.inspect-data')).toContainText('風力機');
  await expect(page.locator('.inspect-data')).toContainText('$2000');
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPad Pro 11'
        ? 'ipad'
        : 'iphone';
  await page.screenshot({
    path: `docs/screenshots/m1-22/${name}.png`,
    scale: 'css',
  });
  if (name === 'iphone') {
    await expect(
      page.getByRole('dialog', { name: '城市物件資訊' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '關閉面板', exact: true }).tap();
  } else await tap(page, 0, -80, touch);
  await expect(page.locator('.inspect-data')).toHaveCount(0);
});
