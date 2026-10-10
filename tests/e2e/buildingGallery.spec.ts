import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
test('shows six building families and plays foundation, structure, finishing and completion on every device', async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./?gallery=1&debug=1');
  const canvas = page.locator('.gallery-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.gallery-card')).toHaveCount(6);
  expect(
    await page.evaluate(() =>
      window.__webcityGallery!().triangles.every((n) => n > 0 && n <= 1500),
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('gallery.png'), scale: 'css' });
  const hashes = new Set<string>();
  for (const [label, p, stage] of [
    ['開工地基', 0, 'foundation'],
    ['蓋到一半', 50, 'structure'],
    ['接近完工', 90, 'finishing'],
    ['完全蓋好', 100, 'complete'],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(canvas).toHaveAttribute('data-progress', String(p));
    await expect(page.locator('.gallery-shell')).toHaveAttribute(
      'data-stage',
      stage,
    );
    const states = await page.evaluate(() => window.__webcityGallery!().stages);
    expect(
      states.every(
        (s) =>
          s.stage === stage &&
          s.siteVisible === p < 100 &&
          s.scaffoldVisible === (p > 0 && p < 100),
      ),
    ).toBe(true);
    hashes.add(
      digest(
        await page.screenshot({
          path: info.outputPath(`construction-${p}.png`),
          scale: 'css',
        }),
      ),
    );
  }
  expect(hashes.size).toBe(4);
  await page
    .getByRole('button', {
      name: '放大查看 低密度住宅 · Lv 2 · 2×2',
      exact: true,
    })
    .click();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.gallery-card')).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath('house-detail.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: '播放施工', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityGallery!().progress))
    .toBeGreaterThan(0.05);
  await page.getByRole('button', { name: '暫停施工', exact: true }).click();
  const stopped = await page.evaluate(
    () => window.__webcityGallery!().progress,
  );
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__webcityGallery!().progress)).toBe(
    stopped,
  );
  await page.getByRole('button', { name: '播放施工', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-progress', '100', {
    timeout: 16000,
  });
  await expect(
    page.getByRole('button', { name: '播放施工', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.gallery-shell')).toHaveAttribute(
    'data-stage',
    'complete',
  );
  await page.getByRole('button', { name: '返回總覽', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '夜間燈光', exact: true }).click();
  expect(await page.evaluate(() => window.__webcityGallery!().night)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('night.png'), scale: 'css' });
  const before = digest(await canvas.screenshot());
  await page.getByRole('button', { name: '向右旋轉', exact: true }).click();
  await page.waitForTimeout(80);
  expect(digest(await canvas.screenshot())).not.toBe(before);
  for (const el of await page
    .locator(
      '.gallery-controls button:visible,.gallery-controls select,.gallery-header a',
    )
    .all()) {
    const b = (await el.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: info.outputPath('landscape.png'),
      scale: 'css',
    });
    const box = (await page.locator('.gallery-controls').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(393);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '蓋到一半', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-progress', '50');
  await context.setOffline(false);
  await page.getByRole('link', { name: '返回主選單', exact: true }).click();
  await expect(page.locator('.main-menu')).toBeVisible();
  await page.goBack();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(errors).toEqual([]);
});
test('catalog reaches every combination and disposes old GPU resources while filtering', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'Desktop',
    'Catalog enumeration is device-independent',
  );
  test.setTimeout(90000);
  await page.goto('./?gallery=1&debug=1');
  const canvas = page.locator('.gallery-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page
    .getByRole('combobox', { name: '分區', exact: true })
    .selectOption('all');
  await expect(page.locator('.gallery-grid')).toHaveAttribute(
    'data-total',
    '164',
  );
  const seen = new Set<string>();
  let textureCount: number | undefined;
  for (let p = 0; p < 28; p++) {
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    for (const key of await page
      .locator('.gallery-card')
      .evaluateAll((cards) =>
        cards.map(
          (c) =>
            `${(c as HTMLElement).dataset.zone}:${(c as HTMLElement).dataset.level}:${(c as HTMLElement).dataset.size}`,
        ),
      ))
      seen.add(key);
    const stats = await page.evaluate(() => window.__webcityGallery!());
    textureCount ??= stats.textures;
    expect(stats.textures).toBe(textureCount);
    expect(stats.textures).toBeGreaterThanOrEqual(2);
    expect(stats.geometries).toBeLessThanOrEqual(60);
    if (p < 27)
      await page.getByRole('button', { name: '下一頁', exact: true }).click();
  }
  expect(seen.size).toBe(164);
  await page
    .getByRole('combobox', { name: '分區', exact: true })
    .selectOption('I');
  await expect(page.locator('.gallery-grid')).toHaveAttribute(
    'data-total',
    '27',
  );
  expect(
    await page
      .locator('select[aria-label="等級"] option[value="4"]')
      .evaluate((o) => (o as HTMLOptionElement).disabled),
  ).toBe(true);
  await page
    .getByRole('combobox', { name: '等級', exact: true })
    .selectOption('3');
  await page
    .getByRole('combobox', { name: '占地', exact: true })
    .selectOption('4×4');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.gallery-card')).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath('factory-detail.png'),
    scale: 'css',
  });
  await page.evaluate(() => {
    const canvas =
      document.querySelector<HTMLCanvasElement>('.gallery-canvas')!;
    const extension = canvas
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 300);
  });
  await expect(canvas).toHaveAttribute('data-ready', 'false');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  const before = digest(await canvas.screenshot());
  await page.getByRole('button', { name: '換個外觀', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(digest(await canvas.screenshot())).not.toBe(before);
  await page
    .getByRole('combobox', { name: '占地', exact: true })
    .selectOption('1×1');
  await expect(
    page.getByText('沒有符合條件的建築，請調整等級或占地。', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.gallery-card')).toHaveCount(0);
});
