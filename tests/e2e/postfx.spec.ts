import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('postprocessing follows height quality and DPR while mobile medium stays interactive', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mkdir('docs/screenshots/m3-07', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  for (const quality of ['medium', 'high', 'low'] as const) {
    await page.goto(`./?play=1&quality=${quality}&debug=1`);
    await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
    await page.addStyleTag({
      content: '.debug-panel,.picking-debug{display:none!important}',
    });
    await page.evaluate(() =>
      window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 400),
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__webcityCamera!.readState().distance),
      )
      .toBeCloseTo(400, 1);
    await page.waitForTimeout(600);
    const flags = Number(
      await page.locator('.debug-panel').getAttribute('data-postfx'),
    );
    if (quality === 'low') expect(flags).toBe(0);
    else {
      expect(flags & 1).toBe(1);
      expect(flags & 4).toBe(4);
      expect(flags & 2).toBe(quality === 'high' ? 2 : 0);
      const dpr = Number(
        await page.locator('.debug-panel').getAttribute('data-dpr'),
      );
      expect(flags & 8).toBe(dpr < 2 ? 8 : 0);
    }
    await page.screenshot({
      path: `docs/screenshots/m3-07/${slug}-${quality}.png`,
      scale: 'css',
    });
    if (quality === 'medium') {
      await page.waitForTimeout(1200);
      const fps = await page.evaluate(async () => {
        const start = performance.now();
        let frames = 0;
        await new Promise<void>((resolve) => {
          const frame = () => {
            frames++;
            if (performance.now() - start >= 3000) resolve();
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        return (frames * 1000) / (performance.now() - start);
      });
      await writeFile(
        `docs/screenshots/m3-07/${slug}-performance.json`,
        JSON.stringify(
          { viewport: info.project.use.viewport, fps, quality, night: true },
          null,
          2,
        ) + '\n',
      );
      expect(fps).toBeGreaterThanOrEqual(30);
      for (const distance of [50, 3000]) {
        await page.evaluate(
          (distance) => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, distance),
          distance,
        );
        await expect
          .poll(() =>
            page.evaluate(() => window.__webcityCamera!.readState().distance),
          )
          .toBeCloseTo(distance, 1);
        await expect
          .poll(async () =>
            Number(
              await page.locator('.debug-panel').getAttribute('data-tilt'),
            ),
          )
          .toBe(0);
      }
    }
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'docs/screenshots/m3-07/iPhone-landscape.png',
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
