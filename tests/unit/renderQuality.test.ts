import { describe, expect, it } from 'vitest';
import {
  detectQuality,
  qualityOverride,
  renderPixelRatio,
  StartupQuality,
  type DeviceProfile,
} from '../../src/render/quality';
import { Lighting } from '../../src/render/lighting';
import { createSky } from '../../src/render/sky';
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
      } else {
        expect(lighting.sun?.castShadow).toBe(level === 'medium');
        expect(lighting.sun?.shadow.mapSize.x).toBe(1024);
        expect(lighting.sun?.target.position).toEqual(new Vector3(10, 0, 20));
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
