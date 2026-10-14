import { expect, type Page } from '@playwright/test';

/** Build actual utilities for the starter street through the same controls as a player. */
export async function starterUtilities(page: Page, touch: boolean) {
  async function tap(x: number, z: number, y = 58) {
    await page.evaluate(
      ({ x, z }) => window.__webcityCamera!.flyTo({ x, z }, 850),
      { x, z },
    );
    await page.waitForFunction(
      ({ x, z }) => {
        const s = window.__webcityCamera!.readState();
        return Math.abs(s.x - x) < 0.1 && Math.abs(s.z - z) < 0.1;
      },
      { x, z },
    );
    const p = await page.evaluate(
      ({ x, y, z }) => {
        const v = window
          .__webcityCamera!.camera.position.clone()
          .set(x, y, z)
          .project(window.__webcityCamera!.camera);
        return {
          x: ((v.x + 1) * innerWidth) / 2,
          y: ((1 - v.y) * innerHeight) / 2,
        };
      },
      { x, y, z },
    );
    expect(
      await page.evaluate(
        (p) => document.elementFromPoint(p.x, p.y)?.tagName,
        p,
      ),
    ).toBe('CANVAS');
    if (touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  }
  const confirm = () =>
    page.getByRole('button', { name: '確認設置', exact: true }).click();
  await page.getByRole('button', { name: '水務', exact: true }).click();
  await tap(-80, -200);
  await confirm();
  await page.getByRole('button', { name: '電力', exact: true }).click();
  await tap(-80, -230);
  await confirm();
  await page.waitForFunction(
    () => window.__webcityStats!()!.water.produced === 6000,
  );
  await page.getByRole('button', { name: '水務', exact: true }).click();
  await page
    .getByRole('combobox', { name: '水務設施' })
    .selectOption('water_drain');
  await tap(382, 0, 58.25);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: '旋轉 90°', exact: true }).click();
  await confirm();
  await page.getByRole('combobox', { name: '水務設施' }).selectOption('pipe');
  for (const [ax, az, bx, bz] of [
    [-80, -192, -80, -80],
    [374, 0, -80, -80],
    [-240, -80, -80, -80],
  ]) {
    await tap(ax!, az!);
    await tap(bx!, bz!);
    await confirm();
  }
  await page.getByRole('button', { name: '電力', exact: true }).click();
  await page.getByRole('combobox', { name: '電力設施' }).selectOption('line');
  for (const [ax, az, bx, bz] of [
    [-80, -220, 374, 0],
    [-80, -220, -80, -56],
    [-240, -104, -80, -104],
    [-240, -56, -80, -56],
  ]) {
    await tap(ax!, az!);
    await tap(bx!, bz!);
    await confirm();
  }
  await page.waitForFunction(
    () => window.__webcityStats!()!.sewage.capacity === 30000,
  );
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -120, z: -80 }, 850),
  );
}
