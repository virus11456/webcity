import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test('renders 50k trees with LOD and clears a newly built road without blocking input', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'webcity-preferences',
      JSON.stringify({ dayNight: false }),
    ),
  );
  await page.goto(
    `./?play=1&quality=${info.project.name === 'Desktop' ? 'high' : 'medium'}&debug=1`,
  );
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(850, 1);
  await page.waitForFunction(
    () => window.__webcityVegetation && !window.__webcityVegetation().pending,
  );
  const before = await page.evaluate(() => window.__webcityVegetation!());
  expect(before.generated).toBe(60000);
  expect(before.rendered).toBeGreaterThanOrEqual(55000);
  const project = async (x: number, z: number) =>
    page.evaluate(
      ({ x, z }) => {
        const camera = window.__webcityCamera!.camera,
          v = camera.position.clone().set(x, 58, z).project(camera);
        return {
          x: ((v.x + 1) * innerWidth) / 2,
          y: ((1 - v.y) * innerHeight) / 2,
        };
      },
      { x, z },
    );
  const start = await project(-240, -80),
    end = await project(-80, -80);
  if (info.project.use.hasTouch) {
    await page.touchscreen.tap(start.x, start.y);
    await page.touchscreen.tap(end.x, end.y);
    await expect(page.locator('.road-controls')).toHaveAttribute(
      'data-valid',
      'true',
    );
    await page.getByRole('button', { name: '✔ 確認建造', exact: true }).tap();
  } else {
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(end.x, end.y);
    await expect(page.locator('.road-controls')).toHaveAttribute(
      'data-valid',
      'true',
    );
    await page.mouse.click(end.x, end.y);
  }
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '1',
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityVegetation!().excluded))
    .toBeGreaterThan(before.excluded);
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.addStyleTag({
    content:
      '.debug-panel,.picking-debug,.population-summary,.toolbar-content,.city-notifications{display:none!important} .road-controls[data-layout="phone-landscape"]{background:transparent;border:0}',
  });
  await mkdir('docs/screenshots/m3-09', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  for (const distance of [150, 900, 3000]) {
    await page.evaluate(
      (d) => window.__webcityCamera!.flyTo({ x: -200, z: -50 }, d),
      distance,
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeCloseTo(distance, 1);
    await page.waitForFunction(() => !window.__webcityVegetation!().pending);
    await page.waitForTimeout(500);
    const stats = await page.evaluate(() => window.__webcityVegetation!());
    if (distance === 150) expect(stats.lod0).toBeGreaterThan(0);
    if (distance === 3000) expect(stats.lod2).toBe(stats.rendered);
    await page.screenshot({
      path: `docs/screenshots/m3-09/${slug}-${distance}.jpg`,
      type: 'jpeg',
      quality: 86,
      scale: 'css',
    });
    if (distance === 900) {
      const measurement = await page.evaluate(async () => {
        const samples: number[] = [];
        let last = performance.now();
        const start = last;
        await new Promise<void>((resolve) => {
          function tick(now: number) {
            samples.push(now - last);
            last = now;
            if (now - start < 4000) requestAnimationFrame(tick);
            else resolve();
          }
          requestAnimationFrame(tick);
        });
        samples.sort((a, b) => a - b);
        return {
          fps: 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length),
          p95: samples[Math.floor(samples.length * 0.95)],
          stats: window.__webcityVegetation!(),
        };
      });
      await writeFile(
        `docs/screenshots/m3-09/${slug}-performance.json`,
        JSON.stringify(measurement, null, 2) + '\n',
      );
      expect(measurement.fps).toBeGreaterThanOrEqual(
        info.project.name === 'Desktop' ? 59 : 30,
      );
    }
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/m3-09/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 86,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
