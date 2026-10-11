import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { facilityCity } from '../fixtures/facilityCity';
import { serialize, deserialize } from '../../src/save/serializer';
import { weatherAt, type WeatherSample } from '../../src/world/weather';
import { mobilityHour } from '../../src/world/schedules';
import { WEATHER } from '../../src/data/weather';
import { TIME } from '../../src/data/config';
import { loadFixture } from './loadFixture';
test.use({ serviceWorkers: 'block' });
async function fixture(kind: WeatherSample['kind']) {
  const base = await facilityCity(),
    s = await deserialize(new Uint8Array(base.data).buffer);
  let ticks = 0;
  for (let i = 0; i < 500; i++) {
    const t = i * WEATHER.periodTicks + WEATHER.periodTicks / 2;
    if (
      weatherAt(s.seed, t).kind === kind &&
      mobilityHour(t) >= 10 &&
      mobilityHour(t) <= 16
    ) {
      ticks = t;
      break;
    }
  }
  expect(ticks).toBeGreaterThan(0);
  s.clock = {
    ticks,
    day: Math.floor(ticks / TIME.ticksPerDay),
    tickInDay: ticks % TIME.ticksPerDay,
    speed: 0,
  };
  return {
    ...base,
    day: s.clock.day,
    data: Array.from(new Uint8Array(await serialize(s))),
  };
}
async function settings(page: Page) {
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await page.locator('.pause-dialog summary').click();
}
async function view(page: Page) {
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await page.evaluate(() => window.__webcityCamera!.flyTo({ x: 0, z: 0 }, 500));
  await page.waitForFunction(
    () => Math.abs(window.__webcityCamera!.readState().distance - 500) < 0.1,
  );
}
test('seeded rain and shadows animate, pause, disable instantly and preserve settings on reload', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await loadFixture(page, await fixture('rain'));
  await view(page);
  await expect
    .poll(() => page.evaluate(() => window.__webcityWeather!().rain))
    .toBe(1);
  expect(await page.evaluate(() => window.__webcityWeather!().particles)).toBe(
    1000,
  );
  const initial = await page.evaluate(() => window.__webcityWeather!().phase);
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.waitForFunction(
    (v) => window.__webcityWeather!().phase > v + 0.5,
    initial,
  );
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  for (const notice of await page.locator('.notice-dismiss').all())
    if (await notice.isVisible()) await notice.click();
  await page.addStyleTag({
    content: '.debug-panel,.picking-debug{display:none!important}',
  });
  await mkdir('docs/screenshots/m4-13', { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/m4-13/${info.project.name.replaceAll(' ', '-')}.jpg`,
    type: 'jpeg',
    quality: 90,
    scale: 'css',
  });
  await settings(page);
  const toggle = page.getByRole('checkbox', {
    name: '天氣（雨、霧與雲影）',
    exact: true,
  });
  await toggle.uncheck();
  await expect
    .poll(() => page.evaluate(() => window.__webcityWeather!()))
    .toMatchObject({ rain: 0, fog: 0, cloud: 0, particles: 0, enabled: false });
  const quality = page.getByRole('combobox', { name: '畫質', exact: true });
  await quality.selectOption('low');
  await toggle.check();
  await expect
    .poll(() => page.evaluate(() => window.__webcityWeather!().particles))
    .toBe(200);
  await quality.selectOption('high');
  await expect
    .poll(() => page.evaluate(() => window.__webcityWeather!().particles))
    .toBe(1000);
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 844, height: 390 });
    await toggle.scrollIntoViewIfNeeded();
    await toggle.uncheck();
    await toggle.check();
    await page.screenshot({
      path: 'docs/screenshots/m4-13/iPhone-landscape.jpg',
      type: 'jpeg',
      quality: 90,
      scale: 'css',
    });
    await page.setViewportSize({ width: 393, height: 852 });
  }
  await toggle.uncheck();
  await page.reload();
  await page
    .getByRole('button', { name: '繼續最近的城市', exact: true })
    .click();
  await page.waitForSelector('.road-controls[data-ready="true"]');
  await expect
    .poll(() => page.evaluate(() => window.__webcityWeather!().enabled))
    .toBe(false);
  await settings(page);
  await toggle.check();
  await page.getByRole('button', { name: '返回城市', exact: true }).click();
  if (info.project.name === 'Desktop')
    for (const kind of ['fog', 'clouds'] as const) {
      await loadFixture(page, await fixture(kind));
      await view(page);
      await expect
        .poll(() => page.evaluate(() => window.__webcityWeather!().kind))
        .toBe(kind);
      await page.addStyleTag({
        content: '.debug-panel,.picking-debug{display:none!important}',
      });
      await page.screenshot({
        path: `docs/screenshots/m4-13/Desktop-${kind}.jpg`,
        type: 'jpeg',
        quality: 90,
        scale: 'css',
      });
    }
  expect(errors).toEqual([]);
});
