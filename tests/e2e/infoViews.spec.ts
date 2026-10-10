import { test, expect } from '@playwright/test';
import { levelsCity } from '../fixtures/levelsCity';
test('implemented information layers switch heatmaps, instance colors and legends without console errors', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const fixture = await levelsCity(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?quality=low&debug=1');
  await expect(page.locator('.main-menu')).toBeVisible();
  await page.evaluate(async (f) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('webcity-saves', 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['slots', 'data'], 'readwrite');
      tx.objectStore('slots').put({
        id: '0',
        settings: f.settings,
        population: f.population,
        day: f.day,
        savedAt: 1,
        thumbnail: null,
      });
      tx.objectStore('data').put(new Uint8Array(f.data).buffer, '0');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, fixture);
  await page.reload();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]');

  const fly = async (x: number, z: number, distance = 250) => {
    await page.evaluate(
      ({ x, z, distance }) => window.__webcityCamera!.flyTo({ x, z }, distance),
      { x, z, distance },
    );
    await page.waitForFunction(
      ({ x, z, distance }) => {
        const c = window.__webcityCamera!.readState();
        return (
          Math.abs(c.distance - distance) < 0.1 &&
          Math.abs(c.x - x) < 0.1 &&
          Math.abs(c.z - z) < 0.1
        );
      },
      { x, z, distance },
    );
  };
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      /WebGLProgram|Shader Error|VALIDATE_STATUS/.test(m.text())
    )
      errors.push(m.text());
  });
  await fly(97, 0);
  await page.getByRole('button', { name: '資訊圖層', exact: true }).click();
  const panel = page.locator('.info-panel'),
    select = page.getByLabel('選擇資訊圖層', { exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-view', 'landValue');
  const choices = await select
    .locator('option')
    .evaluateAll((items) => items.map((o) => (o as HTMLOptionElement).value));
  expect(choices).toHaveLength(18);
  for (const view of choices) {
    await select.selectOption(view);
    await expect(panel).toHaveAttribute('data-view', view);
    await expect(page.locator('#app')).toHaveAttribute(
      'data-underground',
      String(view === 'water' || view === 'sewage'),
    );
    await expect(page.locator('.info-legend')).not.toBeEmpty();
    await page.waitForTimeout(300);
  }
  for (const view of ['landValue', 'power', 'waterPollution']) {
    await select.selectOption(view);
    await fly(
      view === 'landValue' ? 200 : 97,
      0,
      view === 'landValue' ? 800 : 350,
    );
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `docs/screenshots/m2-22/${name}-${view}.png`,
      scale: 'css',
    });
  }
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await select.selectOption('health');
    await page.screenshot({
      path: 'docs/screenshots/m2-22/iphone-landscape.png',
      scale: 'css',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  await page.getByRole('button', { name: '關閉圖層', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: '資訊圖層', exact: true }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
