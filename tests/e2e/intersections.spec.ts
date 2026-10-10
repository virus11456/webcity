import { test, expect } from '@playwright/test';
import { intersectionCity } from '../fixtures/intersectionCity';
test('changes intersection control and shows crosswalks and traffic signals', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await intersectionCity();
  await page.goto('./?quality=low&debug=1');
  await expect(page.locator('.main-menu')).toBeVisible();
  // Seed a valid save through the browser's normal IndexedDB schema, then use the real load button.
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

  await page.waitForFunction(() => !window.__webcityRoadStats!().pending);
  expect(await page.evaluate(() => window.__webcityRoadStats!().signals)).toBe(
    4,
  );
  await page.getByRole('button', { name: '鋪設道路', exact: true }).click();
  const mode = page.getByRole('combobox', { name: '鋪路模式', exact: true });
  await mode.selectOption('junction');
  await page.evaluate(() => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 300));
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 300) < 0.1,
  );
  const p = await page.evaluate(() => {
    const c = window.__webcityCamera!.camera,
      p = c.position.clone().set(0, 60, 0).project(c);
    return {
      x: ((p.x + 1) * innerWidth) / 2,
      y: ((1 - p.y) * innerHeight) / 2,
    };
  });
  expect(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, p),
  ).toBe('CANVAS');
  if (info.project.use.hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  const control = page.getByRole('combobox', { name: '路口控制', exact: true });
  await expect(control).toHaveValue('lights');
  await control.selectOption('stop');
  await page.getByRole('checkbox', { name: '禁止左轉', exact: true }).check();
  await page.getByRole('button', { name: '套用路口設定', exact: true }).click();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-pending',
    'false',
  );
  await mode.selectOption('straight');
  await mode.selectOption('junction');
  if (info.project.use.hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect(control).toHaveValue('stop');
  await expect(
    page.getByRole('checkbox', { name: '禁止左轉', exact: true }),
  ).toBeChecked();
  await control.selectOption('lights');
  await page.getByRole('button', { name: '套用路口設定', exact: true }).click();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-pending',
    'false',
  );
  await page.waitForFunction(() => !window.__webcityRoadStats!().pending);
  await page.screenshot({
    path: `docs/screenshots/m2-05/${info.project.name === 'Desktop' ? 'desktop' : info.project.name === 'iPhone 15' ? 'iphone' : 'ipad'}.png`,
    scale: 'css',
  });
  if (info.project.name === 'Desktop') {
    await page.evaluate(() => {
      window.__webcityCamera!.flyTo({ x: 0, z: -20 }, 150);
    });
    await page.waitForFunction(
      () => Math.abs(window.__webcityCamera!.readState().distance - 150) < 0.1,
    );
    await page.evaluate(() => window.__webcityCamera!.tilt(-0.4));
    await page.waitForFunction(
      () => window.__webcityCamera!.readState().elevation < 0.6,
    );
    await page.screenshot({
      path: 'docs/screenshots/m2-05/detail.png',
      scale: 'css',
    });
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(control).toBeVisible();
    await page.screenshot({
      path: 'docs/screenshots/m2-05/iphone-landscape.png',
      scale: 'css',
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
