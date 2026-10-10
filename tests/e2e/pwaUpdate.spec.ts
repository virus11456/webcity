import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';

test('keeps playing until an available update is accepted', async ({
  page,
}, testInfo) => {
  let revision = 1;
  const root = resolve('dist');
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
  };
  // Serve two real worker revisions without mutating dist or other projects.
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const file = resolve(
        root,
        path.replace(/^\/webcity\//, '') || 'index.html',
      );
      if (!path.startsWith('/webcity/') || !file.startsWith(root + sep)) {
        response.writeHead(404).end();
        return;
      }
      try {
        const data = await readFile(file);
        response.writeHead(200, {
          'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        response.end(
          file.endsWith('/sw.js')
            ? Buffer.concat([data, Buffer.from(`\n// revision ${revision}\n`)])
            : data,
        );
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test server port');
    await page.goto(`http://127.0.0.1:${address.port}/webcity/`);
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    await page.evaluate(() => {
      document.body.dataset.session = 'still-playing';
    });
    revision++;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    const update = page.getByRole('button', {
      name: '有新版本，點此更新',
      exact: true,
    });
    await expect(update).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute(
      'data-session',
      'still-playing',
    );
    const screenshot = testInfo.outputPath('update-prompt.png');
    await page.screenshot({ path: screenshot, scale: 'css' });
    await testInfo.attach('update-prompt', {
      path: screenshot,
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: '稍後' }).click();
    await expect(update).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute(
      'data-session',
      'still-playing',
    );
    await page.reload();
    await expect(update).toBeVisible();
    await page.evaluate(() => {
      document.body.dataset.session = 'before-update';
    });
    await Promise.all([page.waitForEvent('domcontentloaded'), update.click()]);
    await expect(page.getByRole('heading', { name: 'WebCity' })).toBeVisible();
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-session',
      'before-update',
    );
    await expect(update).toHaveCount(0);
    expect(
      await page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.ready).waiting),
      ),
    ).toBe(false);
  } finally {
    await page.close();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
});
