import { expect, it } from 'vitest';
import { Color, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import { DayNight } from '../../src/render/dayNight';
import { Lighting } from '../../src/render/lighting';
import { hourTicks } from '../../src/world/schedules';
import { installNightWindows } from '../../src/render/nightWindows';
import { Streetlights } from '../../src/render/roads/streetlights';
import { RoadGraph } from '../../src/world/roadGraph';
import { roadArms } from '../../src/render/roads/geometry';

it('matches noon, dusk, night, wraps midnight continuously and interpolates colors in linear space', () => {
  const d = new DayNight();
  d.sample(12);
  expect(d.sunIntensity).toBe(3);
  expect(d.ambientIntensity).toBe(1.2);
  expect(d.sun).toEqual(new Color('#FFF1DC'));
  d.sample(19);
  expect(d.sunIntensity).toBe(0.8);
  expect(d.horizon).toEqual(new Color('#E8936A'));
  d.sample(22);
  expect(d.sunIntensity).toBe(0.35);
  expect(d.zenith).toEqual(new Color('#0E1630'));
  const last = d.zenith.clone();
  d.sample(0);
  expect(d.zenith).toEqual(last);
  d.sample(6.75);
  expect(d.sunIntensity).toBeCloseTo(1.8);
  expect(d.sun).toEqual(new Color('#FFB27A').lerp(new Color('#FFE6C8'), 0.5));
  d.sample(NaN);
  expect(d.hour.value).toBe(12);
});
it('uses the commuter clock, respects pause and speed, bounds prediction and restores time after toggling', () => {
  const d = new DayNight(),
    clock = { day: 0, tickInDay: 0, ticks: hourTicks(19), speed: 0 as const };
  d.accept(clock);
  d.update(100);
  expect(d.hour.value).toBeCloseTo(19.008);
  d.accept({ ...clock, speed: 4 });
  d.update(0.03);
  expect(d.hour.value).toBeCloseTo(19.016);
  d.update(100);
  expect(d.hour.value).toBeCloseTo(19.024);
  expect(clock.ticks).toBe(hourTicks(19));
  d.enabled = false;
  d.update(0);
  expect(d.hour.value).toBe(12);
  d.enabled = true;
  d.update(0);
  expect(d.hour.value).toBeCloseTo(19.024);
  d.accept({ ...clock, ticks: hourTicks(6) });
  d.update(0);
  expect(d.hour.value).toBe(6);
});
it('applies the same environment to every quality without adding lights', () => {
  const d = new DayNight();
  d.sample(22);
  for (const quality of ['low', 'medium', 'high'] as const) {
    const scene = new Scene(),
      l = new Lighting(scene, new PerspectiveCamera(), quality, []),
      count = scene.children.length;
    l.setEnvironment(d);
    expect(l.hemisphere.intensity).toBe(0.25);
    for (const sun of l.csm?.lights ?? [l.sun!]) {
      expect(sun.intensity).toBe(0.35);
      expect(sun.color).toEqual(d.sun);
    }
    expect(scene.children).toHaveLength(count);
    l.dispose();
  }
});
it('composes nightly windows with preceding shaders and shares the live hour uniform', () => {
  const material = new MeshStandardMaterial(),
    hour = { value: 20 };
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <emissivemap_fragment>',
  };
  let called = false;
  installNightWindows(material, hour, () => {
    called = true;
  });
  material.onBeforeCompile(
    shader as Parameters<typeof material.onBeforeCompile>[0],
    {} as Parameters<typeof material.onBeforeCompile>[1],
  );
  expect(called).toBe(true);
  expect(shader.uniforms).toHaveProperty('cityHour', hour);
  expect(shader.fragmentShader).toContain('lateOff');
  expect(shader.vertexShader).toContain('instanceMatrix');
  material.dispose();
});
it('places road lights at 32m intervals, keeps night changes geometry-free and disposes them', () => {
  const graph = new RoadGraph();
  graph.addRoad({
    start: { x: 0, z: 0 },
    end: { x: 320, z: 0 },
    type: 'road_small',
    builtDay: 0,
    startHeight: 60,
    endHeight: 60,
  });
  const world = graph.snapshot(),
    lights = new Streetlights(roadArms(world.nodes, world.segments));
  expect(lights.count).toBeGreaterThan(8);
  expect(lights.count).toBeLessThanOrEqual(10);
  const meshes = [...lights.group.children];
  lights.setNight(1);
  lights.setNight(0);
  expect(lights.group.children).toEqual(meshes);
  lights.dispose();
  expect(lights.group.children).toHaveLength(0);
});
