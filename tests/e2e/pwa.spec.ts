import { expect, test } from '@playwright/test';

test('has an installable manifest and works after an offline reload', async ({
  playwright,
}, testInfo) => {
  // Installability checks need a regular profile: incognito cannot install PWAs.
  // An empty userDataDir creates an isolated temporary profile, cleaned on close.
  const options = testInfo.project.use;
  const context = await playwright.chromium.launchPersistentContext('', {
    ...options.launchOptions,
    baseURL: options.baseURL,
    viewport: options.viewport,
    userAgent: options.userAgent,
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch,
  });
  try {
    const page = await context.newPage();
    await page.goto('./');
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    expect(manifest.errors).toEqual([]);
    expect(JSON.parse(manifest.data ?? '{}')).toMatchObject({
      name: 'WebCity',
      start_url: '/webcity/',
      scope: '/webcity/',
      display: 'fullscreen',
      orientation: 'any',
    });
    const installability = await cdp.send('Page.getInstallabilityErrors');
    expect(installability.installabilityErrors).toEqual([]);
    await expect(
      page.getByRole('button', { name: '有新版本，點此更新' }),
    ).toHaveCount(0);
    await expect(page.locator('html')).toHaveCSS('touch-action', 'none');

    const scale = await page.evaluate(() => visualViewport?.scale);
    await page.getByRole('heading', { name: 'WebCity' }).dblclick();
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(scale);
    if (testInfo.project.use.hasTouch) {
      await page.touchscreen.tap(100, 100);
      await page.touchscreen.tap(100, 100);
      expect(await page.evaluate(() => visualViewport?.scale)).toBe(scale);
    }
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'WebCity' })).toBeVisible();
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(20, 26, 34)',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const screenshot = testInfo.outputPath('offline.png');
    await page.screenshot({ path: screenshot, scale: 'css' });
    await testInfo.attach('offline-shell', {
      path: screenshot,
      contentType: 'image/png',
    });
    if (testInfo.project.name === 'iPhone 15') {
      await page.setViewportSize({ width: 852, height: 393 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole('heading', { name: 'WebCity' }),
      ).toBeVisible();
    }
    await context.setOffline(false);
  } finally {
    await context.close();
  }
});
