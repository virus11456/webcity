import { test, expect, type Page } from '@playwright/test';
import { serviceCity } from '../fixtures/serviceCity';
async function tap(page: Page, x: number, z: number, touch: boolean) {
  const p = await page.evaluate(
    ({ x, z }) => {
      const c = window.__webcityCamera!.camera,
        v = c.position.clone().set(x, 60, z).project(c);
      return {
        x: ((v.x + 1) * innerWidth) / 2,
        y: ((1 - v.y) * innerHeight) / 2,
      };
    },
    { x, z },
  );
  expect(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, p),
  ).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
test('parks raise land value and a cancellable tree brush plants a bounded grove', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const fixture = await serviceCity(),
    errors: string[] = [],
    touch = !!info.project.use.hasTouch;
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

  const name =
    info.project.name === 'Desktop'
      ? 'desktop'
      : info.project.name === 'iPhone 15'
        ? 'iphone'
        : 'ipad';
  const fly = async (x: number, z: number, distance = 350) => {
    await page.evaluate(
      ({ x, z, distance }) => window.__webcityCamera!.flyTo({ x, z }, distance),
      { x, z, distance },
    );
    await page.waitForFunction(
      ({ x, z, distance }) => {
        const c = window.__webcityCamera!.readState();
        return (
          Math.abs(c.x - x) < 0.1 &&
          Math.abs(c.z - z) < 0.1 &&
          Math.abs(c.distance - distance) < 0.1
        );
      },
      { x, z, distance },
    );
  };
  await page.getByRole('button', { name: '公共服務', exact: true }).click();
  for (const [id, x] of [
    ['park_small', 0],
    ['park_playground', 120],
    ['park_plaza', 200],
    ['park_large', -180],
  ] as const) {
    await page.locator(`.service-controls [data-item="${id}"]`).click();
    await fly(x, 30);
    await tap(page, x, 9, touch);
    await expect(page.locator('.service-controls')).toHaveAttribute(
      'data-valid',
      'true',
    );
    await page.getByRole('button', { name: '確認設置', exact: true }).click();
    await page.waitForFunction(
      (id) => window.__webcityBuildings!().some((b) => b.defId === id),
      id,
    );
  }
  expect(
    await page.evaluate(
      () =>
        window.__webcityBuildings!().find((b) => b.id === 10001)!.landValue!,
    ),
  ).toBeGreaterThan(10);
  await page.locator('.service-controls [data-item="tree"]').click();
  await fly(0, 100, 280);
  await tap(page, 0, 100, touch);
  await expect(page.locator('.service-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  await page.getByRole('button', { name: '取消預覽', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.__webcityBuildings!().filter((b) => b.defId === 'tree').length,
    ),
  ).toBe(0);
  const points = await page.evaluate(() =>
    [-35, 35].map((x) => {
      const c = window.__webcityCamera!.camera,
        v = c.position.clone().set(x, 60, 100).project(c);
      return {
        x: ((v.x + 1) * innerWidth) / 2,
        y: ((1 - v.y) * innerHeight) / 2,
      };
    }),
  );
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...points[0]!, id: 1 }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: points[0]!.x + ((points[1]!.x - points[0]!.x) * i) / 8,
            y: points[0]!.y + ((points[1]!.y - points[0]!.y) * i) / 8,
            id: 1,
          },
        ],
      });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(points[0]!.x, points[0]!.y);
    await page.mouse.down();
    await page.mouse.move(points[1]!.x, points[1]!.y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.locator('.service-controls')).toHaveAttribute(
    'data-valid',
    'true',
  );
  await page.screenshot({
    path: `docs/screenshots/m2-19/${name}-brush.png`,
    scale: 'css',
  });
  await page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__webcityBuildings!().filter((b) => b.defId === 'tree').length >
      20,
  );
  const count = await page.evaluate(
    () => window.__webcityBuildings!().filter((b) => b.defId === 'tree').length,
  );
  expect(count).toBeLessThanOrEqual(128);
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await fly(0, 60, 450);
  await page.screenshot({
    path: `docs/screenshots/m2-19/${name}-parks.png`,
    scale: 'css',
  });
  await fly(80, 20, 250);
  await tap(page, 80, 16, touch);
  await expect(page.locator('.inspect-data')).toContainText('公園與樹木加成');
  await page
    .locator('.inspect-data')
    .getByText('地價', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m2-19/${name}-land-value.png`,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await page
      .locator('.inspect-data')
      .getByText('地價', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/m2-19/iphone-landscape.png',
      scale: 'css',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(852);
  }
  expect(errors).toEqual([]);
});
