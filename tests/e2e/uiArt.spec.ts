import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { loadFixture } from './loadFixture';
import { effectsCity } from '../fixtures/effectsCity';
test.use({ serviceWorkers: 'block' });
test('uses original icons, renders a real building thumbnail and retains touch and layer controls', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false }),
    ),
  );
  await loadFixture(page, await effectsCity());
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 22 }, 250),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 250) < 0.1,
  );
  const p = await page.evaluate(() => {
    const c = window.__webcityCamera!.camera,
      v = c.position.clone().set(0, 60, 22).project(c);
    return {
      x: ((v.x + 1) * innerWidth) / 2,
      y: ((1 - v.y) * innerHeight) / 2,
    };
  });
  if (info.project.use.hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect(page.locator('.inspect-data')).toHaveAttribute(
    'data-kind',
    'building',
  );
  const thumb = page.locator('.inspect-thumbnail');
  await expect(thumb).toBeVisible();
  await expect
    .poll(() =>
      thumb.evaluate(
        (e: HTMLImageElement) => e.complete && e.naturalWidth === 256,
      ),
    )
    .toBe(true);
  const first = await thumb.getAttribute('src');
  expect(first!.length).toBeGreaterThan(2000);
  await page.addStyleTag({
    content:
      '.debug-panel,.picking-debug,.population-summary{display:none!important}',
  });
  await mkdir('docs/screenshots/m3-16', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await page.screenshot({
    path: `docs/screenshots/m3-16/${slug}-object.jpg`,
    animations: 'disabled',
    quality: 88,
    scale: 'css',
  });
  await page.getByRole('button', { name: '關閉面板', exact: true }).click();
  await page.getByRole('button', { name: '公共服務', exact: true }).click();
  await expect(
    page.locator(
      '.service-controls .build-card[data-item="police_station"] > svg',
    ),
  ).toHaveAttribute('data-icon', 'shield');
  await expect(
    page
      .locator('.service-controls .build-card[data-item="fire_station"] > svg')
      .first(),
  ).toHaveAttribute('data-icon', 'fire');
  await page.screenshot({
    path: `docs/screenshots/m3-16/${slug}-catalog.jpg`,
    animations: 'disabled',
    quality: 88,
    scale: 'css',
  });
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.getByRole('button', { name: '資訊圖層', exact: true }).click();
  await page.locator('.info-view-buttons button[data-view="fireRisk"]').click();
  await expect(page.locator('.info-panel')).toHaveAttribute(
    'data-view',
    'fireRisk',
  );
  await page.screenshot({
    path: `docs/screenshots/m3-16/${slug}-layers.jpg`,
    animations: 'disabled',
    quality: 88,
    scale: 'css',
  });
  const missing = await page
    .locator('button:visible')
    .evaluateAll((buttons) =>
      buttons.filter((b) => !b.querySelector('svg')).map((b) => b.textContent),
    );
  expect(missing).toEqual([]);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'docs/screenshots/m3-16/iPhone-landscape.jpg',
      animations: 'disabled',
      quality: 88,
      scale: 'css',
    });
  }
  await page.getByRole('button', { name: '關閉圖層', exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
