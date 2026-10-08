import { test, expect } from '@playwright/test';

test('UI kit: touch, keyboard, modal focus, notifications and responsive gallery', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?ui-gallery=1');
  const gallery = page.locator('.ui-gallery');
  await expect(gallery).toHaveAttribute(
    'data-layout',
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'phone-portrait'
        : 'tablet',
  );
  const select = page.getByRole('tab', { name: '住宅', exact: true });
  await select.focus();
  await select.press('ArrowRight');
  const shop = page.getByRole('tab', { name: '商業', exact: true });
  await expect(shop).toBeFocused();
  await expect(shop).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('商業分頁示範');
  await shop.press('Home');
  await expect(select).toBeFocused();
  await select.press('End');
  await expect(shop).toBeFocused();
  await shop.press('ArrowRight');
  await expect(select).toBeFocused();
  const slider = page.getByRole('slider', { name: '展示音量', exact: true });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('75');
  await expect(page.getByRole('slider', { name: '鎖定的滑桿' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '處理中…' })).toBeDisabled();
  const help = page.getByRole('button', { name: '控制元件說明', exact: true });
  if (info.project.use.hasTouch) await help.tap();
  else await help.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await help.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
  const open = page
    .getByRole('button', { name: '開啟底部面板', exact: true })
    .first();
  if (info.project.use.hasTouch) await open.tap();
  else await open.click();
  const dialog = page.getByRole('dialog', { name: '底部面板示範' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('slider')).toHaveValue('75');
  for (const target of await dialog.locator('button, input').all()) {
    const box = await target.boundingBox();
    const minimum = info.project.name === 'iPad Pro 11' ? 48 : 44;
    expect(box?.width).toBeGreaterThanOrEqual(minimum);
    expect(box?.height).toBeGreaterThanOrEqual(minimum);
  }
  const close = dialog.getByRole('button', { name: '關閉面板', exact: true });
  await expect(close).toBeFocused();
  await page.screenshot({
    path: `docs/screenshots/m1-19/${info.project.name === 'Desktop' ? 'desktop' : info.project.name === 'iPhone 15' ? 'iphone' : 'ipad'}-sheet.png`,
  });
  await close.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: '取消', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await dialog.getByRole('button', { name: '確認', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await expect(page.locator('.ui-toast').getByRole('status')).toContainText(
    '展示操作完成',
  );
  await page.getByRole('button', { name: '關閉通知', exact: true }).click();
  await expect(page.locator('.ui-toast')).toBeHidden();
  await page.getByRole('button', { name: '測試錯誤通知', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('錯誤通知範例');
  await page.getByRole('button', { name: '關閉通知', exact: true }).click();
  const panel = page.getByRole('region', { name: '可收起的面板', exact: true });
  await panel.getByRole('button', { name: '關閉面板', exact: true }).click();
  await page.getByRole('button', { name: '重新展開面板', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: '關閉面板', exact: true }),
  ).toBeVisible();
  const measure = async () => {
    const targets = gallery.locator('button:visible, a:visible, input:visible');
    for (const target of await targets.all()) {
      const box = await target.boundingBox();
      const minimum = info.project.name === 'iPad Pro 11' ? 48 : 44;
      expect(box?.width).toBeGreaterThanOrEqual(minimum);
      expect(box?.height).toBeGreaterThanOrEqual(minimum);
    }
    expect(
      await gallery.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);
  };
  await measure();
  await gallery.evaluate((node) => node.scrollTo(0, 0));
  const slug =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await page.screenshot({ path: `docs/screenshots/m1-19/${slug}.png` });
  if (info.project.name === 'iPhone 15') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 380, y: 700 }],
    });
    for (let y = 650; y >= 250; y -= 50)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 380, y }],
      });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() => gallery.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(100);
    await cdp.detach();
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(gallery).toHaveAttribute('data-layout', 'phone-landscape');
    await measure();
    await open.tap();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: '確認', exact: true }),
    ).toBeInViewport();
    await dialog.getByRole('button', { name: '取消', exact: true }).tap();
    await gallery.evaluate((node) => node.scrollTo(0, 0));
    await page.screenshot({
      path: 'docs/screenshots/m1-19/iphone-landscape.png',
    });
  }
  expect(errors).toEqual([]);
});
