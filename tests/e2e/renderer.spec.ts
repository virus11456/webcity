import { expect, test } from '@playwright/test';

test('renders shadows, reports real draw statistics and resizes without stretching', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // Independently count WebGL draw calls for the last completed animation frame.
  await page.addInitScript(() => {
    const state = { calls: 0, triangles: 0, lastCalls: 0, lastTriangles: 0 };
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (
      mode,
      count,
      type,
      offset,
    ) {
      state.calls++;
      if (mode === this.TRIANGLES) state.triangles += count / 3;
      return draw.call(this, mode, count, type, offset);
    };
    const instanced = WebGL2RenderingContext.prototype.drawElementsInstanced;
    WebGL2RenderingContext.prototype.drawElementsInstanced = function (
      mode,
      count,
      type,
      offset,
      instances,
    ) {
      state.calls++;
      if (mode === this.TRIANGLES) state.triangles += (count / 3) * instances;
      return instanced.call(this, mode, count, type, offset, instances);
    };
    const arrays = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (
      mode,
      first,
      count,
    ) {
      state.calls++;
      if (mode === this.TRIANGLES) state.triangles += count / 3;
      return arrays.call(this, mode, first, count);
    };
    const arraysInstanced =
      WebGL2RenderingContext.prototype.drawArraysInstanced;
    WebGL2RenderingContext.prototype.drawArraysInstanced = function (
      mode,
      first,
      count,
      instances,
    ) {
      state.calls++;
      if (mode === this.TRIANGLES) state.triangles += (count / 3) * instances;
      return arraysInstanced.call(this, mode, first, count, instances);
    };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        state.calls = 0;
        state.triangles = 0;
        callback(time);
        state.lastCalls = state.calls;
        state.lastTriangles = state.triangles;
        document.documentElement.dataset.glCalls = String(state.lastCalls);
        document.documentElement.dataset.glTriangles = String(
          state.lastTriangles,
        );
      });
  });
  await page.goto('./?quality=high&debug=1');
  const canvas = page.locator('canvas'),
    panel = page.locator('.debug-panel');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(panel).toHaveAttribute('data-quality', 'high');
  await expect(panel).toHaveAttribute('data-shadows', '3');
  await expect.poll(() => panel.getAttribute('data-fps')).not.toBe('0');
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.debug-panel')!;
    const canvas = document.querySelector('canvas')!;
    return {
      calls: Number(panel.dataset.calls),
      triangles: Number(panel.dataset.triangles),
      fps: Number(panel.dataset.fps),
      actualCalls: Number(document.documentElement.dataset.glCalls),
      actualTriangles: Number(document.documentElement.dataset.glTriangles),
      width: canvas.width,
      height: canvas.height,
      dpr: Number(panel.dataset.dpr),
      aspect: Number(panel.dataset.aspect),
      viewport: [innerWidth, innerHeight],
    };
  });
  expect(metrics.calls).toBeGreaterThan(3);
  expect(metrics.calls).toBe(metrics.actualCalls);
  expect(metrics.triangles).toBe(metrics.actualTriangles);
  expect(metrics.fps).toBeGreaterThan(0);
  expect(metrics.width).toBe(Math.floor(metrics.viewport[0]! * metrics.dpr));
  expect(metrics.height).toBe(Math.floor(metrics.viewport[1]! * metrics.dpr));
  expect(metrics.aspect).toBeCloseTo(
    metrics.viewport[0]! / metrics.viewport[1]!,
  );
  const screenshot = testInfo.outputPath('renderer.png');
  await page.screenshot({ path: screenshot, scale: 'css' });
  await testInfo.attach('renderer', {
    path: screenshot,
    contentType: 'image/png',
  });
  const viewport = page.viewportSize()!;
  await page.setViewportSize({
    width: viewport.height,
    height: viewport.width,
  });
  await expect
    .poll(async () => Number(await panel.getAttribute('data-aspect')))
    .toBeCloseTo(viewport.height / viewport.width);
  expect(
    await canvas.evaluate((el) => ({
      width: el.clientWidth,
      height: el.clientHeight,
    })),
  ).toEqual({ width: viewport.height, height: viewport.width });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('renderer-rotated.png'),
    scale: 'css',
  });
  expect(errors).toEqual([]);
});

test('quality overrides control DPR and shadow passes, debug stays opt-in', async ({
  page,
}) => {
  for (const [quality, shadows, cap] of [
    ['low', '0', 1.5],
    ['medium', '1', 2],
  ] as const) {
    await page.goto(`./?quality=${quality}&debug=1`);
    const panel = page.locator('.debug-panel');
    await expect(panel).toHaveAttribute('data-quality', quality);
    await expect(panel).toHaveAttribute('data-shadows', shadows);
    expect(Number(await panel.getAttribute('data-dpr'))).toBeLessThanOrEqual(
      cap,
    );
    expect(Number(await panel.getAttribute('data-calls'))).toBeGreaterThan(10);
  }
  await page.goto('./');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.debug-panel')).toHaveCount(0);
});

test('recovers after a lost WebGL context', async ({ page }) => {
  await page.goto('./?quality=medium&debug=1');
  await expect(page.locator('.debug-panel')).toHaveAttribute(
    'data-quality',
    'medium',
  );
  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Missing WebGL context loss extension');
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 500);
  });
  await expect(page.locator('.render-status')).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'false');
  await expect(page.locator('.render-status')).toBeHidden();
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await expect
    .poll(async () =>
      Number(await page.locator('.debug-panel').getAttribute('data-calls')),
    )
    .toBeGreaterThan(10);
});
