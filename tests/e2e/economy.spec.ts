import { test, expect } from '@playwright/test';
test('finances: change linked tax, borrow, settle a week and repay with touch/keyboard controls', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?play=1&quality=high&debug=1');
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await page.getByRole('button', { name: '財政', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '財政', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-money', '70000');
  await dialog.locator('summary').filter({ hasText: '分區稅率' }).click();
  const rate = dialog.getByRole('slider', { name: '低密度住宅', exact: true });
  await rate.focus();
  await rate.press('ArrowRight');
  await rate.press('Tab');
  await expect(rate).toHaveValue('10');
  await expect(
    dialog.getByRole('slider', { name: '高密度住宅', exact: true }),
  ).toHaveValue('10');
  await expect(dialog.locator('.finance-message')).toHaveText('已套用');
  await dialog.locator('summary').filter({ hasText: '分區稅率' }).click();
  await dialog.locator('summary').filter({ hasText: '部門預算' }).click();
  await expect(
    dialog.getByRole('slider', { name: '電力', exact: true }),
  ).toBeDisabled();
  await dialog.locator('summary').filter({ hasText: '部門預算' }).click();
  await dialog.locator('summary').filter({ hasText: '貸款' }).click();
  const small = dialog.getByRole('button', { name: /^借款 · 小額貸款/ });
  await expect(
    dialog.getByRole('button', { name: /^借款 · 大額貸款/ }),
  ).toBeDisabled();
  if (info.project.use.hasTouch) await small.tap();
  else await small.click();
  await expect(dialog).toHaveAttribute('data-money', '90000');
  await expect(dialog.locator('.finance-loans')).toContainText('剩餘週數 52');
  await dialog.getByRole('button', { name: '關閉財政', exact: true }).click();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-money',
    '90000',
  );
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('.sim-controls')!.getAttribute('data-day'),
      ) >= 7,
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  await page.getByRole('button', { name: '財政', exact: true }).click();
  await expect(dialog).toHaveAttribute('data-week', '1');
  await expect(dialog).toHaveAttribute('data-money', '89607.69');
  await expect(dialog.locator('.finance-summary')).toContainText('$392.31');
  await expect(dialog.locator('.finance-loans')).toContainText('剩餘週數 51');
  await dialog.getByRole('button', { name: '提前還清', exact: true }).click();
  await expect(dialog).toHaveAttribute('data-money', '69992.31');
  await expect(dialog.locator('.finance-loans')).toHaveText('目前沒有貸款');
  await small.click();
  await expect(dialog).toHaveAttribute('data-money', '89992.31');
  await small.click();
  await expect(dialog).toHaveAttribute('data-money', '109992.31');
  await small.click();
  await expect(dialog).toHaveAttribute('data-money', '129992.31');
  await expect(dialog.locator('.finance-loans p')).toHaveCount(3);
  await expect(small).toBeDisabled();
  await dialog.evaluate((d) => (d.scrollTop = 0));
  await page.screenshot({ path: info.outputPath('economy.png'), scale: 'css' });
  const sizes = await dialog
    .locator('button:visible, summary:visible, input:visible')
    .evaluateAll((elements) =>
      elements.map((e) => ({
        w: e.getBoundingClientRect().width,
        h: e.getBoundingClientRect().height,
      })),
    );
  expect(sizes.every((s) => s.w >= 44 && s.h >= 44)).toBe(true);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await dialog.getByRole('button', { name: '關閉財政', exact: true }).click();
    await page.getByRole('button', { name: '財政', exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath('economy-landscape.png'),
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
