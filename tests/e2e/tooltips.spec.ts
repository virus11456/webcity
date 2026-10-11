import {
  test,
  expect,
  type Page,
  type Locator,
  type BrowserContext,
} from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test.use({ serviceWorkers: 'block' });
async function ready(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false, weather: false }),
    ),
  );
  await page.goto('./?play=1&quality=low');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
}
async function help(
  page: Page,
  context: BrowserContext,
  target: Locator,
  touch: boolean,
) {
  await target.scrollIntoViewIfNeeded();
  if (!touch) {
    await target.hover();
    return;
  }
  const cdp = await context.newCDPSession(page),
    box = (await target.boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 },
    ],
  });
  await expect(page.locator('#webcity-tooltip')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
}
async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m5-02', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m5-02/${name}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
}
async function fits(page: Page) {
  const box = (await page.locator('#webcity-tooltip').boundingBox())!,
    size = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
}
test('help shows real costs and locks without selecting on hold, normal activation still works', async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  const touch = !!info.project.use.hasTouch,
    tip = page.locator('#webcity-tooltip'),
    gravel = page.locator('.build-card[data-item="gravel"]');
  await help(page, context, gravel, touch);
  await expect(tip).toContainText('觸控裝置另按確認建造');
  await expect(tip).toContainText('造價');
  await expect(page.getByLabel('道路種類', { exact: true })).toHaveValue(
    'road_small',
  );
  await expect(gravel).toHaveAttribute('aria-describedby', 'webcity-tooltip');
  await fits(page);
  await shot(page, info.project.name.replaceAll(' ', '-'));
  if (touch) await gravel.tap();
  else await gravel.click();
  await expect(page.getByLabel('道路種類', { exact: true })).toHaveValue(
    'gravel',
  );
  await expect(tip).toBeHidden();
  const locked = page.locator('.build-card[data-item="road_medium"]');
  await expect(locked).toBeDisabled();
  await help(page, context, locked, touch);
  await expect(tip).toContainText('MS');
  await expect(tip).toContainText('未解鎖');
  await fits(page);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(tip).toBeHidden();
    await help(page, context, locked, touch);
    await fits(page);
    await shot(page, 'iPhone-landscape');
  }
  await page.locator('.hud-brand').click();
  await expect(tip).toBeHidden();
  expect(errors).toEqual([]);
});
test('keyboard help preserves descriptions and works inside modal dialogs', async ({
  page,
  context,
}, info) => {
  await ready(page);
  const tip = page.locator('#webcity-tooltip'),
    power = page.getByRole('button', { name: '電力', exact: true });
  await power.evaluate((e) => {
    e.setAttribute('aria-describedby', 'existing-help');
    const p = document.createElement('p');
    p.id = 'existing-help';
    p.hidden = true;
    p.textContent = 'Existing description';
    e.parentElement!.append(p);
  });
  await power.focus();
  await expect(tip).toContainText('發電設施');
  await expect(power).toHaveAttribute(
    'aria-describedby',
    'existing-help webcity-tooltip',
  );
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await expect(power).toBeFocused();
  await expect(power).toHaveAttribute('aria-describedby', 'existing-help');
  await page.getByRole('button', { name: '存檔與讀檔', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('存檔清單已更新');
  const save = page
    .locator('[data-slot="0"]')
    .getByRole('button', { name: '儲存', exact: true });
  await help(page, context, save, !!info.project.use.hasTouch);
  await expect(tip).toContainText('目前城市儲存到這個欄位');
  await expect(page.locator('.save-dialog #webcity-tooltip')).toBeVisible();
  await expect(page.locator('[data-slot="0"] img')).toHaveCount(0);
  await fits(page);
  await shot(page, `${info.project.name.replaceAll(' ', '-')}-dialog`);
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await expect(page.locator('.save-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.save-dialog')).toBeHidden();
});
test('touch movement and multitouch cancel help; mouse can move onto the bubble', async ({
  page,
  context,
}, info) => {
  await ready(page);
  const tip = page.locator('#webcity-tooltip'),
    target = page.locator('.build-card[data-item="gravel"]');
  await target.scrollIntoViewIfNeeded();
  if (!info.project.use.hasTouch) {
    await target.hover();
    await expect(tip).toBeVisible();
    await tip.hover();
    await page.waitForTimeout(250);
    await expect(tip).toBeVisible();
    await page.mouse.move(1000, 300);
    await expect(tip).toBeHidden();
    await target.hover();
    await expect(tip).toBeVisible();
    await target.evaluate((e) => e.remove());
    await expect(tip).toBeHidden();
    return;
  }
  const cdp = await context.newCDPSession(page),
    b = (await target.boundingBox())!,
    x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, x, y }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ id: 1, x: x - 30, y }],
  });
  await page.waitForTimeout(650);
  await expect(tip).toBeHidden();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await target.scrollIntoViewIfNeeded();
  const next = (await target.boundingBox())!,
    p = { id: 1, x: next.x + next.width / 2, y: next.y + next.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [p],
  });
  await expect(tip).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [p, { id: 2, x: p.x + 20, y: p.y + 20 }],
  });
  await expect(tip).toBeHidden();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(page.getByLabel('道路種類', { exact: true })).toHaveValue(
    'road_small',
  );
  await cdp.detach();
});
