import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { MILESTONES } from '../../src/data/milestones';
import { serialize } from '../../src/save/serializer';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
test('buy adjacent land with progressive prices and persist the device limit', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = createState({
    seed: 410,
    mapId: 'valley',
    cityName: '土地測試市',
    mode: 'normal',
  });
  s.clock.speed = 0;
  s.unlocked = MILESTONES.map((m) => m.id);
  s.money = 2000000;
  const sim = new Simulation(s.settings, undefined, s);
  await loadFixture(page, {
    settings: s.settings,
    population: 0,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
  });
  await page.getByRole('button', { name: '購買土地', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '購買土地', exact: true });
  await expect(dialog).toBeVisible();
  await page.locator('[data-tile="0"]').click();
  await expect(page.locator('.tiles-status')).toContainText('共用邊界');
  await expect(
    dialog.getByRole('button', { name: /確認購買土地/ }),
  ).toBeDisabled();
  for (const [id, price] of [
    [13, '50,000'],
    [14, '80,000'],
    [9, '110,000'],
  ] as const) {
    await page.locator(`[data-tile="${id}"]`).click();
    await expect(
      dialog.getByRole('button', { name: /確認購買土地/ }),
    ).toHaveText(`確認購買土地 · $${price}`);
    await dialog.getByRole('button', { name: /確認購買土地/ }).click();
    await expect(page.locator(`[data-tile="${id}"]`)).toHaveAttribute(
      'data-owned',
      'true',
    );
  }
  await expect(page.locator('.tiles-summary')).toContainText('1,760,000');
  await page.locator('[data-tile="8"]').click();
  if (info.project.name === 'iPhone 15') {
    await expect(page.locator('.tiles-summary')).toContainText('裝置上限 4');
    await expect(
      dialog.getByRole('button', { name: /確認購買土地/ }),
    ).toBeDisabled();
    await expect(page.locator('.tiles-status')).toContainText('數量上限');
  } else
    await expect(
      dialog.getByRole('button', { name: /確認購買土地/ }),
    ).toBeEnabled();
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m4-10', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m4-10/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('[data-tile="8"]').click();
    await dialog
      .getByRole('button', { name: /確認購買土地/ })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/screenshots/m4-10/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
  await page.getByRole('button', { name: '關閉土地地圖', exact: true }).click();
  await page.getByRole('button', { name: '存檔與讀檔', exact: true }).click();
  await page
    .locator('[data-slot="1"]')
    .getByRole('button', { name: '儲存', exact: true })
    .click();
  await expect(page.locator('[data-slot="1"] img')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('存檔清單已更新');
  await page.reload();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await page.getByRole('button', { name: '購買土地', exact: true }).click();
  for (const id of [12, 13, 14, 9])
    await expect(page.locator(`[data-tile="${id}"]`)).toHaveAttribute(
      'data-owned',
      'true',
    );
  await expect(page.locator('.tiles-summary')).toContainText('1,760,000');
  expect(errors).toEqual([]);
});
