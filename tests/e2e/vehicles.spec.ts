import { test, expect } from '@playwright/test';
import { trafficCity } from '../fixtures/trafficCity';
test('renders and inspects individual moving commuters across device viewports', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await trafficCity();
  await page.goto('./?quality=low&debug=1');
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
  await page.waitForFunction(
    () => window.__webcityVehicles!.stats().agents >= 1000,
  );
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 650));
  await page.waitForFunction(
    () =>
      Math.abs(window.__webcityCamera!.readState().distance - 650) < 0.1 &&
      !window.__webcityRoadStats!().pending,
  );
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  await page.screenshot({
    path: `docs/screenshots/m2-11/${name}.png`,
    scale: 'css',
  });
  const target = await page.evaluate(() => {
    const camera = window.__webcityCamera!.camera;
    return window
      .__webcityVehicles!.samples(1500)
      .filter((a) => a.kind === 0 && a.visible)
      .map((a) => {
        const p = camera.position
          .clone()
          .set(a.x, a.y + 0.8, a.z)
          .project(camera);
        return {
          id: a.id,
          citizen: a.citizenId,
          x: ((p.x + 1) * innerWidth) / 2,
          y: ((1 - p.y) * innerHeight) / 2,
        };
      })
      .filter((p) => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS')
      .sort(
        (a, b) =>
          Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) -
          Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2),
      )[0];
  });
  expect(target).toBeDefined();
  if (info.project.use.hasTouch)
    await page.touchscreen.tap(target!.x, target!.y);
  else await page.mouse.click(target!.x, target!.y);
  await expect(
    page.locator('.inspect-data[data-kind="vehicle"]'),
  ).toHaveAttribute('data-citizen', String(target!.citizen));
  await expect(page.getByText('上班', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '查看工作地點', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/m2-11/${name}-inspect.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '查看工作地點', exact: true }).click();
  await expect(page.locator('.inspect-data')).toHaveCount(0);
  const walker = await page.evaluate(() =>
    window.__webcityVehicles!.samples(1500).find((a) => a.kind === 8),
  );
  expect(walker).toBeDefined();
  await page.evaluate((p) => window.__webcityCamera!.flyTo(p, 80), {
    x: walker!.x,
    z: walker!.z,
  });
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 80) < 0.1,
  );
  await page.waitForFunction(() =>
    window
      .__webcityVehicles!.samples(1500)
      .some((a) => a.kind === 8 && a.visible),
  );
  if (info.project.name === 'Desktop')
    await page.screenshot({
      path: 'docs/screenshots/m2-11/pedestrian.png',
      scale: 'css',
    });
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.waitForFunction((p) => {
    const a = window
      .__webcityVehicles!.samples(1500)
      .find((a) => a.id === p.id);
    return a && Math.hypot(a.x - p.x, a.z - p.z) > 2;
  }, walker!);
  await page.evaluate(() => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 450));
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 450) < 0.1,
  );
  const benchmark = await page.evaluate(
    () =>
      new Promise<{
        fps: number;
        p95: number;
        agents: number;
        visible: number;
      }>((resolve) => {
        const times: number[] = [];
        let first = 0,
          last = 0;
        const frame = (now: number) => {
          first ||= now;
          if (last && now - first > 1000) times.push(now - last);
          last = now;
          if (now - first < 4000) requestAnimationFrame(frame);
          else {
            const sorted = [...times].sort((a, b) => a - b);
            resolve({
              fps: 1000 / (times.reduce((a, b) => a + b, 0) / times.length),
              p95: sorted[Math.floor(sorted.length * 0.95)]!,
              ...window.__webcityVehicles!.stats(),
            });
          }
        };
        requestAnimationFrame(frame);
      }),
  );
  console.log(JSON.stringify({ viewport: info.project.name, ...benchmark }));
  await info.attach('traffic-performance', {
    body: JSON.stringify(benchmark, null, 2),
    contentType: 'application/json',
  });
  expect(benchmark.agents).toBeGreaterThanOrEqual(1000);
  expect(benchmark.visible).toBeGreaterThanOrEqual(1000);
  expect(benchmark.fps).toBeGreaterThanOrEqual(30);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.screenshot({
      path: 'docs/screenshots/m2-11/iphone-landscape.png',
      scale: 'css',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  expect(errors).toEqual([]);
});
