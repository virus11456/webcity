import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { loadFixture } from './loadFixture';
import { effectsCity } from '../fixtures/effectsCity';
test.use({ serviceWorkers: 'block' });
test('unlocks audio with a gesture, decodes MP3 fallback, mixes the city and persists mute with visibility suspension', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/assets/audio/*.ogg', (route) => route.abort());
  await page.goto('./?debug=1');
  await expect(page.locator('.main-menu')).toBeVisible();
  expect(await page.evaluate(() => window.__webcityAudio!().state)).toBe(
    'locked',
  );
  await loadFixture(page, await effectsCity());
  await page.getByRole('button', { name: '探索城市', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().state))
    .toBe('running');
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().loaded))
    .toBe(12);
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().peak))
    .toBeGreaterThan(0.00001);
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 22 }, 160),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().mix.industry))
    .toBeGreaterThan(0.1);
  const near = await page.evaluate(() => window.__webcityAudio!().mix.wind);
  await page.evaluate(() =>
    window.__webcityCamera!.flyTo({ x: 0, z: 22 }, 2400),
  );
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().mix.wind))
    .toBeGreaterThan(near);
  // Deterministic browser lifecycle event; native iOS suspension remains a physical-device check.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().state))
    .toBe('suspended');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: '暫停選單', exact: true }).click();
  await expect(page.locator('.pause-dialog')).toBeVisible();
  await page.locator('.pause-dialog summary').click();
  const volume = page.getByRole('slider', { name: '音量', exact: true });
  await volume.press('Home');
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().levels.volume))
    .toBe(0);
  // Observe the actual audio fade; wall-clock sleeps can precede a render quantum.
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().peak), {
      timeout: 1000,
      intervals: [50],
    })
    .toBeLessThan(0.0001);
  await volume.press('End');
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().state))
    .toBe('running');
  await expect
    .poll(() => page.evaluate(() => window.__webcityAudio!().peak))
    .toBeGreaterThan(0.00001);
  await mkdir('docs/screenshots/m3-17', { recursive: true });
  const slug = info.project.name.replaceAll(' ', '-');
  await page.screenshot({
    path: `docs/screenshots/m3-17/${slug}.jpg`,
    animations: 'disabled',
    quality: 86,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await volume.press('Home');
    await volume.press('End');
    await page.screenshot({
      path: 'docs/screenshots/m3-17/iPhone-landscape.jpg',
      animations: 'disabled',
      quality: 86,
      scale: 'css',
    });
  }
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('webcity-preferences')!).volume,
    ),
  ).toBe(100);
  expect(errors).toEqual([]);
});
