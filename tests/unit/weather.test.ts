import { expect, it, vi } from 'vitest';
import {
  PerspectiveCamera,
  MeshStandardMaterial,
  type WebGLRenderer,
} from 'three';
import { weatherAt } from '../../src/world/weather';
import { Weather } from '../../src/render/weather';
import { WEATHER as W } from '../../src/data/weather';
import { TIME } from '../../src/data/config';
import { readPreferences } from '../../src/ui/preferences';
it('produces all four seeded states without changing during identical reload samples, with smooth period boundaries', () => {
  const kinds = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const sample = weatherAt(413, i * W.periodTicks + W.periodTicks / 2);
    kinds.add(sample.kind);
    expect(weatherAt(413, i * W.periodTicks + W.periodTicks / 2)).toEqual(
      sample,
    );
    for (const value of [sample.rain, sample.fog, sample.cloud])
      expect(value).toBeGreaterThanOrEqual(0);
  }
  expect([...kinds].sort()).toEqual(['clear', 'clouds', 'fog', 'rain']);
  for (const t of [0, 300, 600])
    expect(weatherAt(413, t)).toMatchObject({ rain: 0, fog: 0, cloud: 0 });
  const a = weatherAt(413, 299.99),
    b = weatherAt(413, 300.01);
  expect(Math.abs(a.cloud - b.cloud)).toBeLessThan(0.001);
  expect(weatherAt(413, NaN)).toEqual(weatherAt(413, 0));
});
it('freezes rain and shadow time on pause, disables every effect, restores and scales quality without leaking geometry', () => {
  const camera = new PerspectiveCamera(),
    weather = new Weather(413);
  let ticks = 0;
  while (weatherAt(413, ticks).rain < 1) ticks += W.periodTicks / 2;
  weather.setQuality('low');
  weather.accept({
    ticks,
    day: Math.floor(ticks / TIME.ticksPerDay),
    tickInDay: ticks % TIME.ticksPerDay,
    speed: 0,
  });
  weather.update(1, camera);
  const saved = weather.readState();
  expect(saved.particles).toBe(W.rainCount.low);
  weather.update(20, camera);
  expect(weather.readState()).toEqual(saved);
  weather.enabled = false;
  weather.update(0, camera);
  expect(weather.readState()).toMatchObject({
    kind: 'clear',
    rain: 0,
    fog: 0,
    cloud: 0,
    particles: 0,
  });
  expect(weather.cloud.value).toBe(0);
  weather.enabled = true;
  weather.setQuality('high');
  weather.update(0, camera);
  expect(weather.readState()).toMatchObject({
    rain: 1,
    particles: W.rainCount.high,
  });
  const released = vi.fn();
  weather.rain.geometry.addEventListener('dispose', released);
  weather.dispose();
  expect(released).toHaveBeenCalledOnce();
});
it('preserves prior terrain shader hooks and exposes stable cloud uniforms', () => {
  const weather = new Weather(4),
    material = new MeshStandardMaterial(),
    previous = vi.fn();
  material.onBeforeCompile = previous;
  weather.installShadow(material);
  const shader = {
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
    uniforms: {},
  };
  material.onBeforeCompile(
    shader as Parameters<MaterialHook>[0],
    {} as WebGLRenderer,
  );
  expect(previous).toHaveBeenCalledOnce();
  expect(shader.vertexShader).toContain('weatherWorld');
  expect(shader.fragmentShader).toContain('cloudMask');
  expect(shader.uniforms).toHaveProperty('weatherCloud', weather.cloud);
  weather.dispose();
  material.dispose();
});
type MaterialHook = MeshStandardMaterial['onBeforeCompile'];
it('defaults weather on for older preferences and preserves an explicit off switch', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => JSON.stringify({ weather: false }),
  });
  expect(readPreferences().weather).toBe(false);
  vi.stubGlobal('localStorage', { getItem: () => '{"dayNight":false}' });
  expect(readPreferences().weather).toBe(true);
  vi.unstubAllGlobals();
});
