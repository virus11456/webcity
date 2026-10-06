import { expect, test } from '@playwright/test';

test('renders event-driven construction, abandonment, demolition and restoration on all devices', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./?district=1&debug=1');
  await expect(page.locator('.gallery-canvas')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().detail))
    .toBe(4);
  for (const [label, progress, stage] of [
    ['開工地基', 0, 'foundation'],
    ['蓋到一半', 0.5, 'structure'],
    ['接近完工', 0.9, 'finishing'],
    ['完全蓋好', 1, 'complete'],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__webcityDistrict!().stages.every((s) => s?.detail),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          (p) =>
            window.__webcityDistrict!().stages.every((s) => s?.progress === p),
          progress,
        ),
      )
      .toBe(true);
    const states = await page.evaluate(
      () => window.__webcityDistrict!().stages,
    );
    expect(
      states.every(
        (s) =>
          s?.visual.stage === stage &&
          s.visual.scaffolding === (progress > 0 && progress < 1),
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`district-${progress}.png`),
      scale: 'css',
    });
  }
  let baseline = await page.evaluate(() => window.__webcityDistrict!());
  await page.getByRole('button', { name: '荒廢外觀', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().abandoned))
    .toBe(4);
  await page.screenshot({
    path: info.outputPath('district-abandoned.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: '拆除街區', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().buildings))
    .toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().dust))
    .toBe(0);
  await page.screenshot({
    path: info.outputPath('district-demolished.png'),
    scale: 'css',
  });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '重建街區', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__webcityDistrict!().detail))
      .toBe(4);
    const stats = await page.evaluate(() => window.__webcityDistrict!());
    // Initial shared pool buffers upload lazily; compare equivalent warmed rebuilds.
    if (i === 0) baseline = stats;
    expect(stats.geometries).toBeLessThanOrEqual(baseline.geometries);
    expect(stats.textures).toBeLessThanOrEqual(baseline.textures);
  }
  await page.getByRole('button', { name: '播放施工', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().progress))
    .toBeGreaterThan(0.05);
  await page.getByRole('button', { name: '暫停施工', exact: true }).click();
  const paused = await page.evaluate(
    () => window.__webcityDistrict!().progress,
  );
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__webcityDistrict!().progress)).toBe(
    paused,
  );
  const dimensions = await page
    .locator('.district-controls button')
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        w: n.getBoundingClientRect().width,
        h: n.getBoundingClientRect().height,
        font: parseFloat(getComputedStyle(n).fontSize),
      })),
    );
  expect(dimensions.every((d) => d.w >= 44 && d.h >= 44 && d.font >= 12)).toBe(
    true,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(
      page.getByRole('button', { name: '完全蓋好', exact: true }),
    ).toBeInViewport();
    await page.getByRole('button', { name: '完全蓋好', exact: true }).tap();
    await expect
      .poll(() => page.evaluate(() => window.__webcityDistrict!().progress))
      .toBe(1);
    await page.screenshot({
      path: info.outputPath('district-landscape.png'),
      scale: 'css',
    });
  }
  await page.evaluate(() => {
    const canvas =
      document.querySelector<HTMLCanvasElement>('.gallery-canvas')!;
    const extension = canvas
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 500);
  });
  await expect(page.locator('.gallery-canvas')).toHaveAttribute(
    'data-ready',
    'false',
  );
  await expect(page.locator('.gallery-canvas')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.gallery-canvas')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().detail))
    .toBe(4);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('batches 5,000 distinct-seed buildings with fewer than 100 total draw calls and no resource growth', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'Desktop',
    'Desktop performance fixture; phone/tablet interaction covered above.',
  );
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?district=1&debug=1');
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict?.().detail))
    .toBe(4);
  await page
    .getByRole('button', { name: '展示 5,000 棟', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().buildings), {
      timeout: 40000,
    })
    .toBe(5000);
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().pending))
    .toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().dust))
    .toBe(0);
  const stats = await page.evaluate(() => window.__webcityDistrict!());
  expect(stats.farInstances).toBeGreaterThan(5000);
  expect(stats.calls).toBeLessThan(100);
  expect(stats.triangles).toBeGreaterThan(50000);
  await page.screenshot({
    path: info.outputPath('district-5000.png'),
    scale: 'css',
  });
  await info.attach('5000-building-stats', {
    body: JSON.stringify(stats, null, 2),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: '重建街區', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityDistrict!().detail))
    .toBe(4);
  expect(await page.evaluate(() => window.__webcityDistrict!().buildings)).toBe(
    4,
  );
  expect(errors).toEqual([]);
});
