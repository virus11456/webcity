import { starterUtilities } from './starterUtilities';
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
test('saves an actual city and restores it after reload with thumbnails and separate slots', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const touch = Boolean(info.project.use.hasTouch);
  await page.goto('./?play=1&quality=low&debug=1');
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
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
  await starterUtilities(page, touch);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(() => window.__webcityStats!()!.population > 20);
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
  await page.getByRole('button', { name: '存檔與讀檔', exact: true }).click();
  await expect(page.locator('.save-slot')).toHaveCount(11);
  await page
    .locator('[data-slot="0"]')
    .getByRole('button', { name: '儲存', exact: true })
    .click();
  await expect(page.locator('[data-slot="0"] img')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('存檔清單已更新');
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPad Pro 11'
        ? 'ipad'
        : 'iphone';
  await page.screenshot({
    path: `docs/screenshots/m1-24/${name}.png`,
    scale: 'css',
  });
  await page.reload();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await page.getByRole('button', { name: '存檔與讀檔', exact: true }).click();
  await page
    .locator('[data-slot="0"]')
    .getByRole('button', { name: '讀取', exact: true })
    .click();
  await page.waitForSelector(
    '.road-controls[data-ready="true"][data-segments="1"]',
  );
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  const after = await page.evaluate(() => ({
    stats: window.__webcityStats!(),
    buildings: window.__webcityBuildings!(),
    zones: window.__webcityZoneStats!().painted,
  }));
  expect(after).toEqual(before);
  // Drive the browser visibility event; the snapshot still comes from the real Worker.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as unknown as { visibilityState?: string })
      .visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: '存檔與讀檔', exact: true }).click();
  await expect(page.locator('[data-slot="auto"] img')).toBeVisible();
  await page.getByRole('button', { name: '關閉存檔', exact: true }).click();
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-construction',
    'true',
  );
});
