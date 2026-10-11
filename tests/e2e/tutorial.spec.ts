import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createState } from '../../src/sim/state';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
async function saveReload(page: Page) {
  const enter = page.getByRole('button', { name: '開始鋪路', exact: true });
  if (await enter.isVisible()) await enter.click();
  await page.getByRole('button', { name: '存檔與讀檔', exact: true }).click();
  await page
    .locator('[data-slot="0"]')
    .getByRole('button', { name: '儲存', exact: true })
    .click();
  const overwrite = page.getByRole('button', {
    name: '確認覆寫此存檔',
    exact: true,
  });
  if (await overwrite.isVisible()) await overwrite.click();
  await expect(page.locator('.save-status')).toHaveText('存檔清單已更新');
  await page.goto('./?debug=1&quality=medium');
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]', {
    state: 'attached',
  });
}
async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m5-01', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m5-01/${name}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
}
test('new-city device instructions, real camera gestures, saved progress and skipping', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=medium&debug=1');
  await page.getByRole('button', { name: '新遊戲', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '開啟新手教學（可隨時跳過）' }),
  ).toBeChecked();
  await page.getByRole('button', { name: '開始建城', exact: true }).click();
  const panel = page.locator('.tutorial-panel');
  await expect(panel).toHaveAttribute('data-step', '0');
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  const touch = !!info.project.use.hasTouch;
  await expect(panel).toContainText(touch ? '雙指' : 'WASD');
  await shot(page, info.project.name.replaceAll(' ', '-'));
  await panel.locator('summary').click();
  if (touch) {
    const cdp = await context.newCDPSession(page);
    const move = async (mode: 'pan' | 'zoom' | 'rotate') => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { id: 1, x: 100, y: 470 },
          { id: 2, x: 280, y: 470 },
        ],
      });
      for (let d = 5; d <= 40; d += 5) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints:
            mode === 'pan'
              ? [
                  { id: 1, x: 100 + d, y: 470 },
                  { id: 2, x: 280 + d, y: 470 },
                ]
              : mode === 'zoom'
                ? [
                    { id: 1, x: 100 - d, y: 470 },
                    { id: 2, x: 280 + d, y: 470 },
                  ]
                : [
                    { id: 1, x: 100, y: 470 - d },
                    { id: 2, x: 280, y: 470 + d },
                  ],
        });
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    };
    await move('pan');
    await move('zoom');
    await move('rotate');
  } else {
    await page.locator('canvas').focus();
    await page.keyboard.down('w');
    await expect(panel).toHaveAttribute('data-camera', '1');
    await page.keyboard.up('w');
    await page.keyboard.down('q');
    await expect(panel).toHaveAttribute('data-camera', '3');
    await page.keyboard.up('q');
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, -160);
  }
  await expect(panel).toHaveAttribute('data-step', '1');
  await panel.locator('summary').click();
  await page.getByRole('button', { name: '查看操作位置', exact: true }).click();
  await expect(page.locator('[data-tutorial="road"]')).toHaveClass(
    /tutorial-target/,
  );
  await expect(page.locator('.tutorial-arrow')).toBeVisible();
  await saveReload(page);
  await expect(panel).toHaveAttribute('data-step', '1');
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await shot(page, 'iPhone-landscape');
  }
  await page.getByRole('button', { name: '跳過教學', exact: true }).click();
  await expect(panel).toBeHidden();
  await saveReload(page);
  await expect(panel).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('opening finance completes the last lesson, reward survives reload and cannot be claimed again', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'normal',
    cityName: '教學結業市',
  });
  s.clock.speed = 0;
  s.tutorial = { status: 'active', step: 7, camera: 7, dismissed: false };
  await loadFixture(page, {
    settings: s.settings,
    population: 0,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(s))),
  });
  const panel = page.locator('.tutorial-panel');
  await expect(panel).toHaveAttribute('data-step', '7');
  if (
    await page
      .getByRole('button', { name: '開始鋪路', exact: true })
      .isVisible()
  )
    await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await page.getByRole('button', { name: '財政', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '財政', exact: true }),
  ).toHaveAttribute('data-money', '75000');
  await page.getByRole('button', { name: '關閉財政', exact: true }).click();
  await expect(panel).toHaveAttribute('data-step', '8');
  await expect(panel).toContainText('$5,000');
  await shot(page, `${info.project.name.replaceAll(' ', '-')}-complete`);
  await page.getByRole('button', { name: '繼續建城', exact: true }).click();
  await saveReload(page);
  await expect(panel).toBeHidden();
  if (
    await page
      .getByRole('button', { name: '開始鋪路', exact: true })
      .isVisible()
  )
    await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await page.getByRole('button', { name: '財政', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '財政', exact: true }),
  ).toHaveAttribute('data-money', '75000');
});
