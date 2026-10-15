import { expect, test, type Locator, type Page } from '@playwright/test';

async function tapLocked(page: Page, target: Locator, touch: boolean) {
  await expect(target).toBeDisabled();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(
    await target.evaluate(
      (el, p) => el.contains(document.elementFromPoint(p.x, p.y)),
      point,
    ),
  ).toBe(true);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(target).toBeDisabled();
}

test('locked cards and tools keep compact icons and reveal conditions on a short tap', async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false, weather: false }),
    ),
  );
  await page.goto('./?play=1&quality=low&debug=1');
  const controls = page.locator('.road-controls');
  await expect(controls).toHaveAttribute('data-ready', 'true');
  const touch = Boolean(info.project.use.hasTouch);
  for (const name of ['暫停', '開始鋪路']) {
    const button = page.getByRole('button', { name, exact: true });
    if (touch) await button.tap();
    else await button.click();
  }
  const money = await controls.getAttribute('data-money');
  const tip = page.getByRole('tooltip');
  const road = page.locator('.build-card[data-item="road_medium"]');
  await expect(road).not.toContainText(/MS\d|未解鎖/);
  await expect(road.locator('[data-icon="lock"]')).toBeVisible();
  await tapLocked(page, road, touch);
  await expect(tip).toContainText('人口達到 500 人解鎖');
  await expect(page.getByLabel('道路種類', { exact: true })).toHaveValue(
    'road_small',
  );
  const district = page.getByRole('button', { name: '行政區', exact: true });
  await expect(district).toHaveText('行政區');
  await expect(district.locator('[data-icon="lock"]')).toBeVisible();
  // Dismiss through an ordinary tap outside the bubble before inspecting another lock.
  if (touch) await page.locator('.hud-brand').tap();
  else await page.locator('.hud-brand').click();
  await tapLocked(page, district, touch);
  await expect(tip).toContainText('人口達到 1,200 人解鎖');
  await expect(controls).toHaveAttribute('data-active', 'true');
  if (touch) await page.locator('.hud-brand').tap();
  else await page.locator('.hud-brand').click();
  const service = page.getByRole('button', { name: '公共服務', exact: true });
  if (touch) await service.tap();
  else await service.click();
  const police = page.locator('.build-card[data-item="police_station"]');
  await expect(police).not.toContainText(/MS\d|未解鎖/);
  await tapLocked(page, police, touch);
  await expect(tip).toContainText('人口達到 500 人解鎖');
  await expect(controls).toHaveAttribute('data-money', money!);
  await expect(controls).toHaveAttribute('data-segments', '0');
  await page.screenshot({
    path: `docs/screenshots/compact-locks/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 75,
    scale: 'css',
    animations: 'disabled',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(tip).toBeHidden();
    await tapLocked(page, police, true);
    await expect(tip).toContainText('人口達到 500 人解鎖');
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(852);
    expect(box.y + box.height).toBeLessThanOrEqual(393);
    await page.screenshot({
      path: 'docs/screenshots/compact-locks/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 75,
      scale: 'css',
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
