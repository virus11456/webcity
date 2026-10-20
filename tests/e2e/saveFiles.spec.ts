import { readFile, mkdir } from 'node:fs/promises';
import { test, expect, type Locator } from '@playwright/test';
import { deserialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';

test.use({ serviceWorkers: 'block' });
test('exports a city, protects existing slots from bad files, imports and reloads a backup', async ({
  page,
  hasTouch,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const activate = async (control: Locator) =>
    hasTouch ? control.tap() : control.click();
  const bytes = await readFile(
    new URL('../fixtures/saves/v1-m5.wcity', import.meta.url),
  );
  await loadFixture(page, {
    settings: {
      seed: 72,
      mapId: 'valley',
      mode: 'normal',
      cityName: '歷史存檔回歸城',
    },
    population: 6,
    day: 0,
    data: Array.from(bytes),
  });
  const state = () =>
    page.evaluate(() => ({
      money: window.__webcityStats!()!.money,
      population: window.__webcityStats!()!.population,
      ids: window.__webcityBuildings!().map((b) => b.id),
    }));
  const before = await state();
  const fingerprint = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('webcity-saves', 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const tx = db.transaction(['data', 'slots']);
      const get = (store: string) =>
        new Promise<unknown>((resolve, reject) => {
          const r = tx.objectStore(store).get('0');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const [data, metadata] = await Promise.all([get('data'), get('slots')]);
      db.close();
      return {
        hash: Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', data as ArrayBuffer),
          ),
        ),
        metadata,
      };
    });
  const originalSlot = await fingerprint();
  await activate(page.getByRole('button', { name: '存檔與讀檔', exact: true }));
  await activate(
    page.getByRole('button', { name: '匯出目前城市', exact: true }),
  );
  const link = page.getByRole('link', { name: '下載備份', exact: true });
  await expect(link).toBeVisible();
  const downloading = page.waitForEvent('download');
  await activate(link);
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('WebCity-歷史存檔回歸城.wcity');
  const exported = await readFile((await download.path())!);
  const snapshot = await deserialize(new Uint8Array(exported).buffer);
  expect(snapshot.money).toBe(before.money);
  expect(snapshot.citizens.count).toBe(6);
  expect(await fingerprint()).toEqual(originalSlot);
  const selectFile = async (
    id: string,
    buffer: Buffer,
    name = 'backup.wcity',
  ) => {
    const chooser = page.waitForEvent('filechooser');
    await activate(
      page
        .locator(`[data-slot="${id}"]`)
        .getByRole('button', { name: '匯入檔案', exact: true }),
    );
    await (
      await chooser
    ).setFiles({ name, mimeType: 'application/octet-stream', buffer });
  };
  await selectFile('0', exported, '很長的城市備份名稱'.repeat(12) + '.wcity');
  await expect(
    page.getByRole('button', { name: '確認匯入並覆寫', exact: true }),
  ).toBeVisible();
  await activate(page.getByRole('button', { name: '取消匯入', exact: true }));
  expect(await fingerprint()).toEqual(originalSlot);
  const future = Buffer.from(exported);
  future.writeUInt32LE(100, 4);
  for (const invalid of [Buffer.from('this is not a city file'), future]) {
    await selectFile('0', invalid);
    await activate(
      page.getByRole('button', { name: '確認匯入並覆寫', exact: true }),
    );
    await expect(page.locator('.save-status')).toContainText('匯入失敗');
    expect(await fingerprint()).toEqual(originalSlot);
    expect(await state()).toEqual(before);
  }
  await selectFile('1', exported);
  await activate(page.getByRole('button', { name: '確認匯入', exact: true }));
  await expect(page.locator('.save-status')).toContainText('匯入成功');
  await expect(page.locator('[data-slot="1"]')).toContainText('歷史存檔回歸城');
  expect(await state()).toEqual(before);
  await activate(
    page.getByRole('button', { name: '匯出目前城市', exact: true }),
  );
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await mkdir('docs/screenshots/m5-08', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m5-08/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 85,
    scale: 'css',
    animations: 'disabled',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await link.scrollIntoViewIfNeeded();
    expect(
      await page
        .locator('.save-dialog')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/screenshots/m5-08/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 85,
      scale: 'css',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
  await Promise.all([
    page.waitForEvent('load'),
    activate(
      page
        .locator('[data-slot="1"]')
        .getByRole('button', { name: '讀取', exact: true }),
    ),
  ]);
  await page.waitForSelector('.road-controls[data-ready="true"]');
  expect(await state()).toEqual(before);
  expect(errors).toEqual([]);
});

test('keeps download available after native share cancellation and clears prepared files on close', async ({
  page,
  hasTouch,
}) => {
  // Mock only the OS share-sheet boundary; preparation still uses the real Worker.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      value: ({ files }: ShareData) => files?.length === 1,
    });
    Object.defineProperty(navigator, 'share', {
      value: async ({ files }: ShareData) => {
        document.documentElement.dataset.sharedFile = files![0]!.name;
        throw new DOMException('Cancelled', 'AbortError');
      },
    });
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      document.documentElement.dataset.revokedFile = url;
      revoke(url);
    };
  });
  const activate = async (control: Locator) =>
    hasTouch ? control.tap() : control.click();
  const bytes = await readFile(
    new URL('../fixtures/saves/v1-m5.wcity', import.meta.url),
  );
  await loadFixture(page, {
    settings: {
      seed: 72,
      mapId: 'valley',
      mode: 'normal',
      cityName: '歷史存檔回歸城',
    },
    population: 6,
    day: 0,
    data: Array.from(bytes),
  });
  await activate(page.getByRole('button', { name: '存檔與讀檔', exact: true }));
  await activate(
    page.getByRole('button', { name: '匯出目前城市', exact: true }),
  );
  const share = page.getByRole('button', {
    name: '分享／儲存到檔案',
    exact: true,
  });
  await expect(share).toBeVisible();
  const link = page.getByRole('link', { name: '下載備份', exact: true });
  const url = await link.getAttribute('href');
  await activate(share);
  await expect(page.locator('html')).toHaveAttribute(
    'data-shared-file',
    /\.wcity$/,
  );
  await expect(page.locator('.save-status')).toContainText('備份已準備好');
  await expect(link).toBeVisible();
  await activate(page.getByRole('button', { name: '關閉存檔', exact: true }));
  await expect(page.locator('html')).toHaveAttribute('data-revoked-file', url!);
  await activate(page.getByRole('button', { name: '存檔與讀檔', exact: true }));
  await expect(link).toBeHidden();
  await expect(share).toBeHidden();
});
