import { readFile, mkdir } from 'node:fs/promises';
import { test, expect, type Locator } from '@playwright/test';
import { loadFixture } from './loadFixture';

test.use({ serviceWorkers: 'block' });
test('loads an archived M1 city, saves it again and resumes after reload', async ({
  page,
  hasTouch,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const activate = async (control: Locator) =>
    hasTouch ? control.tap() : control.click();
  const original = await readFile(
    new URL('../fixtures/saves/v1-m1.wcity', import.meta.url),
  );
  await loadFixture(page, {
    settings: {
      seed: 72,
      mapId: 'valley',
      mode: 'normal',
      cityName: '歷史存檔回歸城',
    },
    population: 0,
    day: 0,
    data: Array.from(original),
  });
  const state = () =>
    page.evaluate(() => ({
      money: window.__webcityStats!()!.money,
      population: window.__webcityStats!()!.population,
      homes: window.__webcityBuildings!().map((b) => ({
        id: b.id,
        residents: b.residents,
      })),
    }));
  const before = await state();
  expect(before).toEqual({
    money: 90000,
    population: 6,
    homes: [{ id: 10001, residents: 6 }],
  });
  await activate(page.getByRole('button', { name: '存檔與讀檔', exact: true }));
  await activate(
    page
      .locator('[data-slot="1"]')
      .getByRole('button', { name: '儲存', exact: true }),
  );
  await expect(page.locator('.save-status')).toHaveText('存檔清單已更新');
  await expect(page.locator('[data-slot="1"]')).toContainText('歷史存檔回歸城');
  await mkdir('docs/screenshots/m5-07', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m5-07/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 85,
    scale: 'css',
    animations: 'disabled',
  });
  await page.reload();
  await activate(
    page.getByRole('button', { name: '繼續最近的城市', exact: true }),
  );
  await page.waitForSelector('.road-controls[data-ready="true"]');
  expect(await state()).toEqual(before);
  await activate(page.getByRole('button', { name: '×1', exact: true }));
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '1',
  );
  await expect
    .poll(() => page.locator('.sim-controls').getAttribute('data-day'))
    .not.toBe('0');
  await activate(page.getByRole('button', { name: '暫停', exact: true }));
  expect(errors).toEqual([]);
});
