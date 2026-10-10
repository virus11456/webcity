import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dayNightCity } from '../fixtures/dayNightCity';

test('day dusk and night use saved commuter time with windows lamps vehicle lights and a live setting', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mkdir('docs/screenshots/m3-06', { recursive: true });
  for (const [name, hour] of [
    ['day', 12],
    ['dusk', 19],
    ['night', 22],
  ] as const) {
    const fixture = await dayNightCity(hour);
    await page.goto(
      `./?debug=1&quality=${info.project.name === 'Desktop' ? 'high' : 'medium'}`,
    );
    await expect(page.locator('.main-menu')).toBeVisible();
    await page.evaluate(async (f) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('webcity-saves', 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['slots', 'data'], 'readwrite');
        tx.objectStore('slots').put({
          id: '0',
          settings: f.settings,
          population: f.population,
          day: f.day,
          savedAt: 1,
          thumbnail: null,
        });
        tx.objectStore('data').put(new Uint8Array(f.data).buffer, '0');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, fixture);
    await page.reload();
    await page
      .getByRole('button', { name: '繼續最近的城市', exact: true })
      .click();
    await page.waitForSelector('.road-controls[data-ready="true"]');

    await page.getByRole('button', { name: '探索城市', exact: true }).click();
    await page.addStyleTag({
      content:
        ".debug-panel,.picking-debug,.population-summary,.toolbar-content,.city-notifications {display:none!important} .road-controls[data-layout='phone-landscape'] {background:transparent;border:0}",
    });
    await page.evaluate(() =>
      window.__webcityCamera!.flyTo({ x: -740, z: 0 }, 200),
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeCloseTo(200, 1);
    await expect
      .poll(async () =>
        Number(await page.locator('.debug-panel').getAttribute('data-hour')),
      )
      .toBeCloseTo(hour, 1);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `docs/screenshots/m3-06/${info.project.name.replaceAll(' ', '-')}-${name}.png`,
      scale: 'css',
    });
  }
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: -100 }, 150),
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(150, 1);
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityVehicles!.stats().lightPairs),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: `docs/screenshots/m3-06/${info.project.name.replaceAll(' ', '-')}-traffic.png`,
    scale: 'css',
  });
  const before = Number(
    await page.locator('.debug-panel').getAttribute('data-hour'),
  );
  await page.waitForTimeout(600);
  expect(
    Number(await page.locator('.debug-panel').getAttribute('data-hour')),
  ).toBe(before);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.locator('.debug-panel').getAttribute('data-hour')),
    )
    .toBeGreaterThan(before + 0.02);
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await page.locator('.pause-dialog summary').click();
  await page.getByRole('checkbox', { name: '日夜循環', exact: true }).uncheck();
  await expect
    .poll(async () =>
      Number(await page.locator('.debug-panel').getAttribute('data-hour')),
    )
    .toBe(12);
  await page.getByRole('checkbox', { name: '日夜循環', exact: true }).check();
  await expect
    .poll(async () =>
      Number(await page.locator('.debug-panel').getAttribute('data-hour')),
    )
    .toBeGreaterThan(22);
  await page.getByRole('button', { name: '返回城市', exact: true }).click();
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.screenshot({
      path: 'docs/screenshots/m3-06/iPhone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
