import { test, expect } from '@playwright/test';

test('top bar reflects real worker days, funds and demand on every layout', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?play=1&quality=low&debug=1');
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const hud = page.locator('.topbar');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  await expect(hud).toHaveAttribute('data-money', '70000');
  const initial = Number(await hud.getAttribute('data-stats-day'));
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await expect
    .poll(async () => Number(await hud.getAttribute('data-stats-day')))
    .toBeGreaterThan(initial);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  const day = await hud.getAttribute('data-stats-day');
  const stats = await page.evaluate(() => window.__webcityStats!()!);
  const phone = info.project.name === 'iPhone 15';
  if (phone) await page.getByRole('button', { name: '展開城市詳細資訊' }).tap();
  const details = phone ? page.getByRole('dialog') : hud;
  await expect(details.locator('[data-field="population"]')).toHaveText(
    String(stats.population),
  );
  await expect(details.locator('[data-field="happiness"]')).toHaveText(
    `${Math.round(stats.happiness)}%`,
  );
  for (const [i, key] of (['R', 'C', 'I', 'O'] as const).entries())
    await expect(details.getByRole('meter').nth(i)).toHaveAttribute(
      'aria-valuenow',
      String(stats.demand[key]),
    );
  if (phone) {
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: '展開城市詳細資訊' }),
    ).toBeFocused();
  }
  await page.waitForTimeout(300);
  await expect(hud).toHaveAttribute('data-stats-day', day!);
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await page.getByRole('button', { name: '財政', exact: true }).click();
  const finance = page.getByRole('dialog', { name: '財政', exact: true });
  await finance.locator('summary').filter({ hasText: '貸款' }).click();
  await finance.getByRole('button', { name: /^借款 · 小額貸款/ }).click();
  await expect(hud).toHaveAttribute('data-money', '90000');
  await finance.getByRole('button', { name: '關閉財政', exact: true }).click();
  const measure = async () => {
    expect(
      await hud.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    const summary = hud.locator('.topbar-summary');
    expect(
      await summary.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    for (const button of await hud.locator('button:visible').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  };
  await measure();
  const populationPanel = page.locator('.population-summary');
  const panelBox = (await populationPanel.boundingBox())!;
  const hudBox = (await hud.boundingBox())!;
  expect(panelBox.y).toBeGreaterThanOrEqual(hudBox.y + hudBox.height);
  await page.getByRole('button', { name: '展示街區', exact: true }).click();
  await page.getByRole('button', { name: '市中心', exact: false }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(950, 1);
  const slug = phone
    ? 'iphone'
    : info.project.name === 'Desktop'
      ? 'desktop'
      : 'ipad';
  await page.screenshot({
    path: `docs/screenshots/m1-20/${slug}.png`,
    scale: 'css',
  });
  if (phone) {
    await page.getByRole('button', { name: '展開城市詳細資訊' }).tap();
    await page.screenshot({
      path: 'docs/screenshots/m1-20/iphone-details.png',
      scale: 'css',
    });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(hud).toHaveAttribute('data-layout', 'phone-landscape');
    await measure();
    await page.getByRole('button', { name: '×2', exact: true }).tap();
    await expect(page.locator('.sim-controls')).toHaveAttribute(
      'data-speed',
      '2',
    );
    await page.getByRole('button', { name: '暫停', exact: true }).tap();
    await page.screenshot({
      path: 'docs/screenshots/m1-20/iphone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});

test('top bar renders negative funds and long city names from worker message fixtures', async ({
  page,
}, info) => {
  // Presentation edge cases only: this fixture does not assert economy simulation behavior.
  await page.addInitScript({
    content: `
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      addEventListener(type, listener, options) {
        if (type !== 'message') return super.addEventListener(type, listener, options);
        return super.addEventListener(type, (event) => {
          const data = structuredClone(event.data);
          if (data.t === 'ready') {
            data.snapshot.settings.cityName = '這是一座名稱非常非常長的測試城市';
            data.snapshot.stats.money = data.snapshot.money = -987654321.45;
            data.snapshot.stats.population = 987654321;
          }
          if (data.t === 'stats') { data.stats.money = -987654321.45; data.stats.population = 987654321; }
          listener.call(this, new MessageEvent('message', { data }));
        }, options);
      }
    };
  `,
  });
  await page.goto('./?play=1&quality=low');
  const hud = page.locator('.topbar');
  await expect(hud).toHaveAttribute('data-money', '-987654321.45');
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  expect(
    await hud.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  if (info.project.name === 'iPhone 15')
    await page.getByRole('button', { name: '展開城市詳細資訊' }).tap();
  const value = page.locator('[data-field="money"]');
  await expect(value).toHaveText('−$987,654,321.45');
  await expect(value).toHaveCSS('color', 'rgb(255, 107, 107)');
});
