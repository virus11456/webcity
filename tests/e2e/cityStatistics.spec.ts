import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { trafficCity } from '../fixtures/trafficCity';
import { loadFixture } from './loadFixture';
import { deserialize } from '../../src/save/serializer';
import { cityStatistics } from '../../src/world/cityStatistics';
import { savedRoadTraffic } from '../../src/world/roadTraffic';
test.use({ serviceWorkers: 'block' });
test('city statistics show real residents and traffic on desktop and touch', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await trafficCity(64),
    s = await deserialize(Uint8Array.from(fixture.data).buffer);
  const expected = cityStatistics(
    s.buildings,
    s.stats,
    savedRoadTraffic(s.segments, s.traffic),
  );
  await loadFixture(page, fixture);
  await page.getByRole('button', { name: '城市統計', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '城市統計', exact: true });
  await expect(dialog.locator('[data-stat="population"]')).toHaveText(
    expected.population.toLocaleString('zh-TW'),
  );
  await expect(dialog.locator('[data-stat="vehicles"]')).toHaveText(
    String(expected.vehicles),
  );
  for (let i = 0; i < 4; i++)
    await expect(dialog.locator(`[data-stat="age${i}"]`)).toContainText(
      expected.ages[i]!.toLocaleString('zh-TW'),
    );
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m4-16', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m4-16/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  await dialog.locator('[data-stat="vehicles"]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m4-16/${info.project.name.replaceAll(' ', '-')}-traffic.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await dialog.locator('[data-stat="flow"]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/m4-16/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const close = page.getByRole('button', {
      name: '關閉城市統計',
      exact: true,
    });
    await close.scrollIntoViewIfNeeded();
    await close.tap();
  } else
    await page
      .getByRole('button', { name: '關閉城市統計', exact: true })
      .click();
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.getByRole('button', { name: '城市統計', exact: true }).click();
  await expect
    .poll(
      async () => await dialog.locator('[data-stat="speedKmh"]').textContent(),
    )
    .not.toBe(
      expected.speedKmh!.toLocaleString('zh-TW', { maximumFractionDigits: 1 }),
    );
  expect(errors).toEqual([]);
});
