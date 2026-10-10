import { test, expect } from '@playwright/test';
import { benchmarkCity } from '../fixtures/benchmarkCity';
test('renders a real 5000 resident saved city at the viewport frame budget', async ({
  page,
}, info) => {
  test.skip(
    Boolean(process.env.CI),
    'FPS targets require a hardware GPU; functional integration still runs in CI.',
  );
  test.setTimeout(150000);
  const fixture = await benchmarkCity();
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
  await page.waitForFunction(
    () => window.__webcityStats!()!.population >= 5000,
  );
  await page.waitForFunction(
    () => window.__webcityBuildingStats!().pending === 0,
  );
  await page.getByRole('button', { name: '×1', exact: true }).click();
  const samples = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const result: number[] = [];
        let start = 0,
          previous = 0;
        function frame(now: number) {
          start ||= now;
          if (previous && now - start > 2000) result.push(now - previous);
          previous = now;
          if (now - start < 7000) requestAnimationFrame(frame);
          else resolve(result);
        }
        requestAnimationFrame(frame);
      }),
  );
  const fps = 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length);
  const report = {
    viewport: info.project.name,
    population: fixture.population,
    buildings: fixture.buildings,
    quality: 'low',
    fps,
    frames: samples.length,
    p95ms: [...samples].sort((a, b) => a - b)[
      Math.floor(samples.length * 0.95)
    ],
  };
  await info.attach('population-5000-performance', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify(report));
  // A 60 Hz display reports ~59.9 from timestamp rounding; allow a 3% scheduling tolerance.
  expect(fps).toBeGreaterThanOrEqual(info.project.name === 'Desktop' ? 58 : 30);
});
