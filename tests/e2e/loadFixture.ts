import { expect, type Page } from '@playwright/test';
import type { CitySettings } from '../../src/world/snapshot';
export async function loadFixture(
  page: Page,
  f: {
    settings: CitySettings;
    population: number;
    day: number;
    data: number[];
  },
) {
  await page.goto('./?quality=high&debug=1');
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
  }, f);
  await page.reload();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -120, z: -80 }, 850),
  );
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 850) < 0.1,
  );
}
