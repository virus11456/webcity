import { describe, expect, it } from 'vitest';
import {
  detectQuality,
  qualityOverride,
  renderPixelRatio,
  StartupQuality,
  type DeviceProfile,
} from '../../src/render/quality';
import { Lighting } from '../../src/render/lighting';
import { createSky, fogDensityAtHeight } from '../../src/render/sky';
import { MeshStandardMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';

const device: DeviceProfile = {
  userAgent: 'Desktop',
  touchPoints: 0,
  screenWidth: 1440,
  screenHeight: 900,
  gpu: '',
};
it('honors valid overrides and ignores malformed query values', () => {
  for (const level of ['low', 'medium', 'high'])
    expect(qualityOverride(`?debug=1&quality=${level}`)).toBe(level);
  for (const search of ['', '?quality=auto', '?quality=HIGH'])
    expect(qualityOverride(search)).toBeNull();
});
it('classifies desktop, mobile, old iPhone and iPad Pro profiles conservatively', () => {
  expect(detectQuality(device)).toBe('high');
  expect(
    detectQuality({ ...device, userAgent: 'iPhone', gpu: 'Apple A10 GPU' }),
  ).toBe('low');
  expect(
    detectQuality({ ...device, userAgent: 'iPhone', gpu: 'Apple A17 GPU' }),
  ).toBe('medium');
  expect(detectQuality({ ...device, userAgent: 'Android' })).toBe('medium');
  expect(detectQuality({ ...device, userAgent: 'iPad' })).toBe('medium');
  expect(
    detectQuality({
      ...device,
      userAgent: 'iPad',
      screenWidth: 834,
      screenHeight: 1194,
    }),
  ).toBe('high');
  expect(
    detectQuality({
      ...device,
      userAgent: 'Macintosh',
      touchPoints: 5,
      gpu: 'Apple M2',
    }),
  ).toBe('high');
  expect(
    detectQuality({ ...device, userAgent: 'Macintosh', touchPoints: 5 }),
  ).toBe('medium');
});
it('scales before applying DPR caps and handles invalid DPR', () => {
  expect(renderPixelRatio('low', 1)).toBe(0.75);
  expect(renderPixelRatio('low', 3)).toBe(1.5);
  expect(renderPixelRatio('medium', 3)).toBe(2);
  expect(renderPixelRatio('high', 3)).toBe(2);
  expect(renderPixelRatio('high', NaN)).toBe(1);
  expect(renderPixelRatio('high', 0)).toBe(1);
});
it('samples the initial five visible seconds and only downgrades once', () => {
  const slow = new StartupQuality();
  expect(slow.sample(0, false)).toBeNull();
  for (let time = 100; time < 5000; time += 100)
    expect(slow.sample(time, false)).toBeNull();
  expect(slow.sample(5000, false)).toBe('low');
  expect(slow.sample(10000, false)).toBeNull();
  const fast = new StartupQuality();
  for (let time = 0; time <= 5100; time += 10)
    expect(fast.sample(time, false)).toBeNull();
  const reset = new StartupQuality();
  reset.sample(0, false);
  reset.reset();
  expect(reset.sample(10000, false)).toBeNull();
  expect(reset.sample(10001, false)).toBeNull();
  expect(new StartupQuality().sample(99999, true)).toBeNull();
});
describe('lighting ownership', () => {
  it.each(['low', 'medium', 'high'] as const)(
    '%s installs and disposes the specified shadow resources',
    (level) => {
      const scene = new Scene(),
        camera = new PerspectiveCamera(50, 1, 1, 6000),
        material = new MeshStandardMaterial();
      const lighting = new Lighting(scene, camera, level, [material]);
      lighting.update(new Vector3(10, 0, 20));
      lighting.resize();
      expect(lighting.hemisphere.intensity).toBe(1.2);
      if (level === 'high') {
        expect(lighting.csm?.lights).toHaveLength(3);
        expect(lighting.csm?.lights[0]?.shadow.mapSize.x).toBe(2048);
        expect(material.defines?.USE_CSM).toBe(1);
        expect(material.defines?.CSM_FADE).toBeDefined();
        expect(lighting.csm?.fade).toBe(true);
      } else {
        expect(lighting.sun?.castShadow).toBe(level === 'medium');
        expect(lighting.sun?.shadow.mapSize.x).toBe(1024);
        expect(
          lighting.sun!.target.position.distanceTo(new Vector3(10, 0, 20)),
        ).toBeLessThan(0.5);
      }
      lighting.dispose();
      expect(scene.children).toHaveLength(0);
      expect(material.defines?.USE_CSM).toBeUndefined();
      material.dispose();
    },
  );
  it('creates an untextured sky with palette colors and no depth writes', () => {
    const sky = createSky();
    expect(sky.material.depthWrite).toBe(false);
    expect(sky.geometry.type).toBe('SphereGeometry');
    expect(sky.material.uniforms.zenith?.value).toBeDefined();
    sky.geometry.dispose();
    sky.material.dispose();
  });
});

it('thins fog smoothly at altitude without removing the horizon or varying below the ground', () => {
  expect(fogDensityAtHeight(40)).toBe(0.00012);
  expect(fogDensityAtHeight(-100)).toBe(0.00012);
  expect(fogDensityAtHeight(NaN)).toBe(0.00012);
  expect(fogDensityAtHeight(2040)).toBeCloseTo(0.000036, 9);
  expect(fogDensityAtHeight(9000)).toBe(fogDensityAtHeight(2040));
  let previous = Infinity;
  for (let y = 0; y <= 4000; y += 20) {
    const density = fogDensityAtHeight(y);
    expect(density).toBeLessThanOrEqual(previous);
    expect(density).toBeGreaterThan(0);
    previous = density;
  }
  expect(
    Math.abs(fogDensityAtHeight(120.01) - fogDensityAtHeight(119.99)),
  ).toBeLessThan(1e-10);
});

it('stabilizes the medium shadow image while following large camera moves', () => {
  const lighting = new Lighting(
    new Scene(),
    new PerspectiveCamera(),
    'medium',
    [],
  );
  const focus = new Vector3();
  lighting.update(focus);
  const sun = lighting.sun!,
    first = sun.target.position.clone();
  // Move only in the shadow image plane by substantially less than one texel.
  focus.set(0.001, 0, 0.001);
  lighting.update(focus);
  const right = new Vector3(1, 0, 1).normalize();
  expect(sun.target.position.dot(right)).toBeCloseTo(first.dot(right), 10);
  lighting.update(focus.set(1200, 50, -300));
  expect(sun.target.position.distanceTo(focus)).toBeLessThan(0.5);
  expect(sun.position.clone().sub(sun.target.position).length()).toBeCloseTo(
    600,
  );
  expect(sun.shadow.bias).toBe(-0.0005);
  expect(sun.shadow.normalBias).toBe(0.02);
  lighting.dispose();
});

it('only downgrades after two sustained slow windows, resets on recovery, ignores forced and hidden gaps', async () => {
  const { SustainedQuality } = await import('../../src/render/quality');
  const sample = (
    q: InstanceType<typeof SustainedQuality>,
    start: number,
    end: number,
    step: number,
    forced = false,
    level: 'high' | 'medium' | 'low' = 'high',
  ) => {
    const result: string[] = [];
    for (let t = start; t <= end; t += step) {
      const next = q.sample(t, forced, level);
      if (next) result.push(next);
    }
    return result;
  };
  const slow = new SustainedQuality();
  expect(sample(slow, 0, 19900, 100)).toEqual([]);
  expect(slow.sample(20000, false, 'high')).toBe('medium');
  expect(sample(slow, 20100, 40100, 100, false, 'medium')).toEqual(['low']);
  const recovery = new SustainedQuality();
  expect(sample(recovery, 0, 10000, 100)).toEqual([]);
  expect(sample(recovery, 10010, 20000, 10)).toEqual([]);
  expect(sample(recovery, 20100, 30000, 100)).toEqual([]);
  recovery.reset();
  expect(recovery.sample(999999, false, 'high')).toBeNull();
  expect(sample(new SustainedQuality(), 0, 50000, 100, true)).toEqual([]);
  expect(sample(new SustainedQuality(), 0, 50000, 100, false, 'low')).toEqual(
    [],
  );
});
