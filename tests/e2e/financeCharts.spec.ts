import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createState } from '../../src/sim/state';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
test('52 weekly samples switch metrics, scrub exact values and restore from a save', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '財政趨勢市',
  });
  s.clock = { ticks: 4200, day: 420, tickInDay: 0, speed: 0 };
  s.statsHistory = Array.from({ length: 60 }, (_, i) => {
    const week = i + 1;
    return {
      ...s.stats,
      day: week * 7,
      income: 1000 + week * 50,
      expenses: 800 + week * 30,
      money: Math.round(30000 * Math.sin(week / 8) + week * 400),
    };
  });
  s.stats = { ...s.statsHistory.at(-1)! };
  s.money = s.stats.money;
  await loadFixture(page, {
    settings: s.settings,
    population: 0,
    day: 420,
    data: Array.from(new Uint8Array(await serialize(s))),
  });
  await page.getByRole('button', { name: '財政', exact: true }).click();
  await page.locator('.finance-history summary').click();
  const host = page.locator('.finance-history');
  await expect(host).toHaveAttribute('data-points', '52');
  await expect(host).toHaveAttribute('data-first-week', '9');
  await expect(host).toHaveAttribute('data-last-week', '60');
  const source = await page.locator('.finance-chart').getAttribute('src');
  expect(source).toMatch(/^data:image\/png;base64,/);
  await host.getByRole('button', { name: '支出', exact: true }).click();
  await expect(host).toHaveAttribute('data-metric', 'expenses');
  expect(await page.locator('.finance-chart').getAttribute('src')).not.toBe(
    source,
  );
  await host.getByRole('button', { name: '資金餘額', exact: true }).click();
  await expect(host).toHaveAttribute('data-metric', 'money');
  const range = page.getByRole('slider', { name: '選擇歷史週次', exact: true });
  await range.focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.chart-readout')).toContainText('週 9');
  await expect(page.locator('.chart-readout')).toContainText('$1,450');
  await range.focus();
  await page.keyboard.press('End');
  await expect(page.locator('.chart-readout')).toContainText('週 60');
  await expect(page.locator('.chart-readout')).toContainText('$4,000');
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m4-15', { recursive: true });
  await host.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m4-15/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await range.scrollIntoViewIfNeeded();
    const box = (await range.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height / 2);
    expect(Number(await range.inputValue())).toBeGreaterThan(0);
    expect(Number(await range.inputValue())).toBeLessThan(51);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/screenshots/m4-15/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
  }
  await page.reload();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]', {
    state: 'attached',
  });
  await page.getByRole('button', { name: '財政', exact: true }).click();
  await page.locator('.finance-history summary').click();
  await expect(host).toHaveAttribute('data-points', '52');
  await page.getByRole('button', { name: '關閉財政', exact: true }).click();
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.getByRole('button', { name: '財政', exact: true }).click();
  await expect(host).toHaveAttribute('data-last-week', '61', {
    timeout: 15000,
  });
  await expect(host).toHaveAttribute('data-first-week', '10');
  expect(errors).toEqual([]);
});
