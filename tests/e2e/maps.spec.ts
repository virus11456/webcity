import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolveMap } from '../../src/world/mapSelection';
import { Terrain } from '../../src/world/terrain';
test.use({ serviceWorkers: 'block' });
test('preset and random previews match seeded terrain and remain usable on touch', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?debug=1');
  await page.getByRole('button', { name: '新遊戲', exact: true }).click();
  const map = page.getByRole('combobox', { name: '地圖', exact: true }),
    image = page.getByRole('img', { name: '地形預覽' }),
    seed = page.getByLabel('地圖種子', { exact: true });
  const sources = new Set<string>();
  await mkdir('docs/screenshots/m4-17', { recursive: true });
  for (const id of ['valley', 'bay', 'mountains', 'random']) {
    await map.selectOption(id);
    await expect(image).toHaveAttribute('data-map', id);
    sources.add((await image.getAttribute('src'))!);
    if (info.project.name === 'Desktop') {
      await image.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `docs/screenshots/m4-17/map-${id}.jpg`,
        type: 'jpeg',
        quality: 90,
        scale: 'css',
      });
    }
  }
  expect(sources.size).toBe(4);
  const oldSeed = await seed.inputValue();
  await page
    .getByRole('button', { name: '換一張隨機地圖', exact: true })
    .click();
  expect(await seed.inputValue()).not.toBe(oldSeed);
  await seed.fill('42');
  await expect(image).toHaveAttribute('data-seed', '42');
  const source = await image.getAttribute('src');
  await seed.fill('43');
  await expect(image).toHaveAttribute('data-seed', '43');
  expect(await image.getAttribute('src')).not.toBe(source);
  await seed.fill('42');
  await expect(image).toHaveAttribute('data-seed', '42');
  expect(await image.getAttribute('src')).toBe(source);
  await seed.fill('');
  await expect(page.getByRole('status')).toHaveText('請輸入有效的整數種子碼。');
  await seed.fill('42');
  await expect(image).toHaveAttribute('data-seed', '42');
  await image.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m4-17/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await image.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/m4-17/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const start = page.getByRole('button', { name: '開始建城', exact: true });
  await start.scrollIntoViewIfNeeded();
  if (info.project.name === 'iPhone 15') await start.tap();
  else await start.click();
  await page.waitForSelector('.road-controls[data-ready="true"]', {
    state: 'attached',
  });
  const height = new Terrain(42, resolveMap('random', 42)!).heightAt(
    1500,
    1500,
  );
  expect(
    (await page.evaluate(() => window.__webcityTerrain!(1500, 1500))).height,
  ).toBeCloseTo(height, 4);
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await page
    .getByRole('button', { name: '儲存並回主選單', exact: true })
    .click();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]', {
    state: 'attached',
  });
  expect(
    (await page.evaluate(() => window.__webcityTerrain!(1500, 1500))).height,
  ).toBeCloseTo(height, 4);
  expect(errors).toEqual([]);
});
