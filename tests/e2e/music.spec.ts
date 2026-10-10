import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test.use({ serviceWorkers: 'block' });
test('streams one music track after gesture, advances playlist, pauses and persists independent volume', async ({
  page,
}, info) => {
  const errors: string[] = [];
  const music = new Set<string>();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().endsWith('.m4a')) music.add(r.url());
  });
  await page.goto('./?debug=1');
  await expect(page.locator('.main-menu')).toBeVisible();
  expect(await page.evaluate(() => window.__webcityMusic!().track)).toBeNull();
  expect(music.size).toBe(0);
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__webcityMusic!().time))
    .toBeGreaterThan(0.2);
  const first = await page.evaluate(() => window.__webcityMusic!().track);
  expect(
    await page.evaluate(() => window.__webcityMusic!().duration),
  ).toBeCloseTo(192, 0);
  expect(music.size).toBe(1);
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>(
      'audio[data-webcity-music]',
    )!;
    audio.currentTime = audio.duration - 0.15;
  });
  await expect
    .poll(() => page.evaluate(() => window.__webcityMusic!().track))
    .not.toBe(first);
  await expect
    .poll(() => page.evaluate(() => window.__webcityMusic!().time))
    .toBeGreaterThan(0.2);
  expect(music.size).toBe(2);
  const volume = page.getByRole('slider', { name: '背景音樂', exact: true });
  await volume.press('Home');
  await expect
    .poll(() => page.evaluate(() => window.__webcityMusic!().paused))
    .toBe(true);
  expect(
    await page.evaluate(() => window.__webcityAudio!().levels.volume),
  ).toBe(60);
  await volume.press('End');
  await expect
    .poll(() => page.evaluate(() => window.__webcityMusic!().paused))
    .toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__webcityMusic!().paused)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(() => window.__webcityMusic!().paused))
    .toBe(false);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('webcity-preferences')!).musicVolume,
    ),
  ).toBe(100);
  await mkdir('docs/screenshots/m3-18', { recursive: true });
  await volume.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/m3-18/${info.project.name.replaceAll(' ', '-')}.jpg`,
    animations: 'disabled',
    quality: 86,
    scale: 'css',
  });
  if (info.project.name === 'iPhone 15') {
    await page.setViewportSize({ width: 852, height: 393 });
    await volume.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/m3-18/iPhone-landscape.jpg',
      animations: 'disabled',
      quality: 86,
      scale: 'css',
    });
  }
  expect(errors).toEqual([]);
});
