import { starterUtilities } from './starterUtilities';
import { test, expect, type Page } from '@playwright/test';
test.use({ actionTimeout: 10000 });
async function tap(page: Page, x: number, z: number, touch: boolean) {
  const p = await page.evaluate(
    ({ x, z }) => {
      const v = window
        .__webcityCamera!.camera.position.clone()
        .set(x, 58, z)
        .project(window.__webcityCamera!.camera);
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
test('actual residents move in, find work, pause, and leave demolished housing', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const touch = Boolean(info.project.use.hasTouch),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./?play=1&quality=high&debug=1');
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  expect(await page.evaluate(() => window.__webcityStats!()!.demand)).toEqual({
    R: 70,
    C: 20,
    I: 20,
    O: 0,
  });
  await page.getByRole('button', { name: '開始鋪路', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(850, 1);
  await tap(page, -240, -80, touch);
  await tap(page, -80, -80, touch);
  if (touch)
    await page.getByRole('button', { name: '確認建造', exact: true }).tap();
  await expect(page.locator('.road-controls')).toHaveAttribute(
    'data-segments',
    '1',
  );
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await page.waitForFunction(() => !window.__webcityZoneStats!().pending);
  await tap(page, -200, -100, touch);
  await page.getByRole('combobox', { name: '分區種類' }).selectOption('CL');
  await tap(page, -200, -60, touch);
  await expect(page.locator('.population-summary')).toHaveAttribute(
    'data-population',
    '0',
  );
  await starterUtilities(page, touch);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(() => {
    const s = window.__webcityStats!();
    return (
      s?.populationDetails &&
      s.populationDetails.occupiedHouseholds > 5 &&
      s.populationDetails.employed > 0
    );
  });
  // Individual citizens can leave or die; a living city need not fill every home simultaneously.
  await page.waitForFunction(() => {
    const zoned = window.__webcityBuildings!().filter(
      (b) => b.kind === 'zoned',
    );
    return zoned.length > 0 && zoned.every((b) => b.state === 'active');
  });
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  const before = await page.evaluate(() => ({
    stats: window.__webcityStats!()!,
    buildings: window.__webcityBuildings!(),
  }));
  expect(before.stats.demand.R).toBeGreaterThan(70);
  expect(before.stats.demand.C).toBeLessThan(20);
  const details = before.stats.populationDetails!;
  for (const home of before.buildings.filter((b) => b.housing)) {
    expect(home.housing!.occupied).toBeGreaterThanOrEqual(0);
    expect(home.housing!.occupied).toBeLessThanOrEqual(home.households);
  }
  expect(before.stats.population).toBe(
    before.buildings.reduce((sum, b) => sum + b.residents, 0),
  );
  expect(details.jobs).toBe(
    before.buildings.reduce((sum, b) => sum + b.jobs, 0),
  );
  expect(details.employed).toBeGreaterThan(0);
  expect(details.employed).toBeLessThanOrEqual(details.jobs);
  expect(details.employed).toBeLessThanOrEqual(details.availableWorkers);
  expect(details.unemployed + details.employed).toBe(details.availableWorkers);
  await expect(page.locator('.population-summary')).toHaveAttribute(
    'data-population',
    String(before.stats.population),
  );
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__webcityStats!())).toEqual(
    before.stats,
  );
  await page.getByRole('button', { name: '查看建築', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(220, 1);
  await page.waitForFunction(() => {
    const s = window.__webcityBuildingStats!();
    return (
      s.pending === 0 &&
      s.lodPending === 0 &&
      s.detail > 0 &&
      s.buildings ===
        window.__webcityBuildings!().filter((b) => b.kind === 'zoned').length
    );
  });
  await page.screenshot({
    path: info.outputPath('population-employed.png'),
    scale: 'css',
  });
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: -120, z: -80 }, 850),
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__webcityCamera!.readState().distance),
    )
    .toBeCloseTo(850, 1);
  const home = before.buildings
    .filter((b) => b.residents > 0)
    .sort((a, b) => Math.abs(a.pos.x + 190) - Math.abs(b.pos.x + 190))[0]!;
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  await page.locator('.bulldoze-controls select').selectOption('building');
  await tap(
    page,
    home.pos.x + Math.sin(home.rotation) * home.lotD * 4,
    home.pos.z + Math.cos(home.rotation) * home.lotD * 4,
    touch,
  );
  await page.waitForFunction(
    (id) => !window.__webcityBuildings!().some((b) => b.id === id),
    home.id,
  );
  await expect(page.locator('.population-summary')).toHaveAttribute(
    'data-population',
    String(before.stats.population - home.residents),
  );
  expect(
    await page.evaluate(
      () => window.__webcityStats!()!.populationDetails!.movedOut,
    ),
  ).toBeGreaterThanOrEqual(home.residents);
  // Remove commercial zoning first; public utility jobs must remain available.
  await page.getByRole('button', { name: '分區', exact: true }).click();
  await page.getByRole('combobox', { name: '分區種類' }).selectOption('clear');
  await tap(page, -200, -60, touch);
  await page.getByRole('button', { name: '×4', exact: true }).click();
  await page.waitForFunction(
    () => !window.__webcityBuildings!().some((b) => b.defId === 'CL'),
  );
  // Demand settles on the next day after structural removal.
  await page.waitForFunction(() => window.__webcityStats!()!.demand.C > 20);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  expect(
    await page.evaluate(() => window.__webcityStats!()!.demand.R),
  ).toBeLessThan(before.stats.demand.R);
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-speed',
    '0',
  );
  const publicJobs = await page.evaluate(() => ({
    stats: window.__webcityStats!()!,
    facilities: window.__webcityBuildings!().filter(
      (b) => b.kind === 'utility',
    ),
  }));
  expect(publicJobs.stats.populationDetails!.jobs).toBe(
    publicJobs.facilities.reduce((sum, b) => sum + b.jobs, 0),
  );
  expect(publicJobs.stats.populationDetails!.jobs).toBeLessThan(details.jobs);
  expect(publicJobs.stats.populationDetails!.employed).toBeGreaterThan(0);
  // M2 gives utilities real jobs too. Remove those workplaces while paused to test unemployment.
  await page.getByRole('button', { name: '拆除', exact: true }).click();
  await page.locator('.bulldoze-controls select').selectOption('building');
  for (const facility of publicJobs.facilities) {
    const x = facility.pos.x + Math.sin(facility.rotation) * facility.lotD * 4;
    const z = facility.pos.z + Math.cos(facility.rotation) * facility.lotD * 4;
    await page.evaluate(
      ({ x, z }) => window.__webcityCamera!.flyTo({ x, z }, 850),
      { x, z },
    );
    await page.waitForFunction(
      ({ x, z }) => {
        const c = window.__webcityCamera!.readState();
        return Math.abs(c.x - x) < 0.1 && Math.abs(c.z - z) < 0.1;
      },
      { x, z },
    );
    await tap(page, x, z, touch);
    await page.waitForFunction(
      (id) => !window.__webcityBuildings!().some((b) => b.id === id),
      facility.id,
    );
  }
  expect(await page.evaluate(() => window.__webcityStats!()!.population)).toBe(
    publicJobs.stats.population,
  );
  await expect(page.locator('.population-summary')).toHaveAttribute(
    'data-employed',
    '0',
  );
  expect(
    await page.evaluate(
      () => window.__webcityStats!()!.populationDetails!.unemployed,
    ),
  ).toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath('population-no-jobs.png'),
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    expect(
      await page
        .locator('.population-summary')
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(12);
  }
  expect(errors).toEqual([]);
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const state = await page.evaluate(() => ({
      stats: window.__webcityStats?.(),
      buildings: window.__webcityBuildings?.(),
    }));
    await info.attach('city-state', {
      body: JSON.stringify(state, null, 2),
      contentType: 'application/json',
    });
  }
});
