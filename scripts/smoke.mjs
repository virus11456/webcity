// M0-01 shell check; M0-02 will introduce Playwright's full project configuration.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const server = await preview({
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  await mkdir('test-results', { recursive: true });
  for (const [name, width, height, touch] of [
    ['iphone', 393, 852, true],
    ['ipad', 834, 1194, true],
    ['desktop', 1440, 900, false],
    ['iphone-landscape', 852, 393, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const response = await page.goto('http://127.0.0.1:4173');
    assert.equal(response?.status(), 200);
    await page.getByRole('heading', { name: 'WebCity', exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        overflow:
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
        overlay: Boolean(document.querySelector('vite-error-overlay')),
      })),
      { background: 'rgb(20, 26, 34)', overflow: false, overlay: false },
    );
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
    assert.deepEqual(errors, [], `${name}: browser errors`);
    console.log(
      `PASS ${name} (${width}×${height}): heading, background, no overflow, no errors`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
