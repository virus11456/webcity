import { test, expect } from '@playwright/test';
import { benchmarkCity } from '../fixtures/benchmarkCity';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
test.use({ serviceWorkers: 'block' });
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
  const debug = page.locator('.debug-panel');
  await expect
    .poll(async () => Number(await debug.getAttribute('data-worker-samples')))
    .toBeGreaterThan(0);
  const diagnostic = await debug.evaluate((e) => ({
    ...(e as HTMLElement).dataset,
  }));
  const report = {
    viewport: info.project.name,
    population: fixture.population,
    buildings: fixture.buildings,
    quality: 'low',
    diagnostic,
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
  const dir = 'docs/performance/m5-03';
  await mkdir(dir, { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await expect
    .poll(async () => {
      const a = (await debug.boundingBox())!,
        b = (await page.locator('.picking-debug').boundingBox())!;
      return b.y - a.y - a.height;
    })
    .toBeGreaterThanOrEqual(8);
  await writeFile(
    `${dir}/${slug}.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  await page.screenshot({
    path: `${dir}/${slug}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(async () => {
        const panel = (await debug.boundingBox())!,
          tabs = (await page.locator('.road-tabs').boundingBox())!;
        return panel.x - tabs.x - tabs.width;
      })
      .toBeGreaterThanOrEqual(4);
    await expect
      .poll(async () => {
        const a = (await debug.boundingBox())!,
          b = (await page.locator('.picking-debug').boundingBox())!;
        return b.y - a.y - a.height;
      })
      .toBeGreaterThanOrEqual(8);
    await page.screenshot({
      path: `${dir}/iPhone-landscape.jpg`,
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
  }
  // A 60 Hz display reports ~59.9 from timestamp rounding; allow a 3% scheduling tolerance.
  expect(fps).toBeGreaterThanOrEqual(info.project.name === 'Desktop' ? 58 : 30);
  expect(Number(diagnostic.frameP95Ms)).toBeLessThan(
    info.project.name === 'Desktop' ? 8 : 14,
  );
});

test('measures cold main-menu interaction under a specified 4G profile', async ({
  page,
  context,
}, info) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: 'cellular4g',
  });
  const scripts = new Map<string, Promise<Buffer>>();
  page.on('response', (r) => {
    if (r.request().resourceType() === 'script') scripts.set(r.url(), r.body());
  });
  await page.goto('./');
  const menu = page.locator('.main-menu');
  await expect(menu).toBeVisible();
  const start = menu.getByRole('button', { name: '新遊戲', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(
    page.getByRole('heading', { name: '新遊戲', exact: true }),
  ).toBeVisible();
  const interactiveMs = await page.evaluate(() => performance.now());
  const requested = [...scripts];
  const gzipBytes = (
    await Promise.all(
      requested.map(async ([, data]) => gzipSync(await data).length),
    )
  ).reduce((a, b) => a + b, 0);
  const report = {
    viewport: info.project.name,
    interactiveMs,
    gzipBytes,
    scripts: requested.map(([url]) => new URL(url).pathname),
    network:
      '150ms latency, 1.6Mbps down / 0.75Mbps up, cold cache, SW blocked; local Chrome, no CPU throttling',
    scope:
      'main menu interactive, not full city startup; heap/viewport emulation is not physical iPhone memory',
  };
  await mkdir('docs/performance/m5-03', { recursive: true });
  await writeFile(
    `docs/performance/m5-03/${info.project.name.replaceAll(' ', '-')}-startup.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  expect(gzipBytes).toBeLessThan(400_000);
  expect(interactiveMs).toBeLessThan(
    info.project.name === 'Desktop' ? 3000 : 5000,
  );
  await cdp.detach();
});
