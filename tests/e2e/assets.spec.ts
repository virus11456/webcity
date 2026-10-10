import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('compressed GLB and KTX2 load, retry, interact, and survive offline reload', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let modelRequests = 0;
  let fail = true;
  await context.route('**/models/*.glb', async (route) => {
    modelRequests++;
    if (fail) {
      fail = false;
      await route.fulfill({ status: 503, body: 'temporary' });
    } else await route.continue();
  });
  await page.goto('./?asset-gallery=1');
  await expect(page.getByRole('status')).toHaveText(
    '模型載入失敗，請重新載入。',
  );
  await page.getByRole('button', { name: '重新載入', exact: true }).click();
  const model = page.locator('canvas');
  await expect(model).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(model).toHaveAttribute('data-textures', '1');
  expect(Number(await model.getAttribute('data-triangles'))).toBeGreaterThan(
    50,
  );
  expect(modelRequests).toBe(2);
  await page.getByRole('button', { name: '重新載入', exact: true }).click();
  await expect(model).toHaveAttribute('data-ready', 'true');
  expect(modelRequests).toBe(2);
  await page.getByRole('button', { name: '重設視角' }).click();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await mkdir('docs/screenshots/m3-01', { recursive: true });
  const slug = testInfo.project.name.replaceAll(' ', '-');
  await page.screenshot({ path: `docs/screenshots/m3-01/${slug}.png` });
  if (testInfo.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page.getByRole('button', { name: '重設視角' }).tap();
    await page.screenshot({
      path: 'docs/screenshots/m3-01/iPhone-landscape.png',
    });
  }
  await context.unroute('**/models/*.glb');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // On first install clientsClaim makes the loaded app a controlled client.
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  // A controlled load stores the content-hashed model in CacheFirst media cache.
  await page.reload();
  await expect(model).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await caches.open('webcity-media');
        return (await cache.keys()).some((request) =>
          request.url.endsWith('.glb'),
        );
      }),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(model).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
