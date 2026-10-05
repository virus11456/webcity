import { expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { RtsCamera, type CameraOptions } from '../../src/render/camera';
import { CAMERA } from '../../src/data/rendering';
const bounds = { minX: -2400, maxX: 2400, minZ: -2400, maxZ: 2400 };
function make(options: Partial<CameraOptions> = {}) {
  const view = new PerspectiveCamera(45, 1.5, 1, 10000);
  return new RtsCamera(view, { bounds, heightAt: () => 0, ...options });
}
function settle(camera: RtsCamera, seconds = 2, fps = 60): void {
  for (let i = 0; i < seconds * fps; i++) camera.update(1 / fps);
}
it('enforces bounds, distance and elevation with distance-dependent tilt', () => {
  const c = make({
    initial: { x: 9999, z: -9999, distance: 1, elevation: Math.PI },
  });
  expect(c.readState()).toMatchObject({ x: 2400, z: -2400, distance: 20 });
  expect(c.readState().elevation).toBeCloseTo(Math.PI / 3);
  c.flyTo({ x: 0, z: 0 }, 99999);
  c.update(1);
  c.tilt(10);
  settle(c);
  expect(c.readState().distance).toBe(4000);
  expect(c.readState().elevation).toBeCloseTo((89 * Math.PI) / 180);
  c.pan(-99999, 99999);
  c.zoom(0.0001);
  c.tilt(-10);
  settle(c);
  expect(c.readState().x).toBeCloseTo(-2400);
  expect(c.readState().z).toBeCloseTo(2400);
  expect(c.readState().distance).toBeCloseTo(20);
  expect(c.readState().elevation).toBeCloseTo((15 * Math.PI) / 180);
});
it('uses frame-rate independent damping and the shortest angular path', () => {
  const slow = make(),
    fast = make();
  for (const c of [slow, fast]) {
    c.pan(500, -200);
    c.rotate(Math.PI * 2 + 0.5);
    c.tilt(0.2);
    c.zoom(2);
  }
  settle(slow, 1, 30);
  settle(fast, 1, 120);
  const a = slow.readState(),
    b = fast.readState();
  for (const key of ['x', 'z', 'distance', 'azimuth', 'elevation'] as const)
    expect(a[key]).toBeCloseTo(b[key], 8);
  const wrap = make({ initial: { azimuth: Math.PI - 0.01 } });
  wrap.rotate(0.02);
  wrap.update(1 / 60);
  expect(wrap.readState().azimuth).toBeGreaterThan(Math.PI - 0.01);
});
it('flies to the exact clamped target within one second at different frame rates', () => {
  for (const fps of [15, 30, 60, 120]) {
    const c = make();
    c.flyTo({ x: 800, z: -600 }, 800);
    settle(c, 1, fps);
    expect(c.readState().x).toBeCloseTo(800, 8);
    expect(c.readState().z).toBeCloseTo(-600, 8);
    expect(c.readState().distance).toBeCloseTo(800, 8);
  }
  const c = make();
  c.flyTo({ x: 99999, z: 99999 }, -1);
  c.update(1.5);
  expect(c.readState()).toMatchObject({ x: 2400, z: 2400, distance: 20 });
});
it('interrupts and replaces flights without jumping the current pose', () => {
  const c = make();
  c.flyTo({ x: 1000, z: 1000 }, 1000);
  c.update(0.25);
  const before = c.readState();
  c.pan(10, 0);
  expect(c.readState()).toEqual(before);
  settle(c);
  expect(c.readState().x).toBeCloseTo(before.x + 10);
  c.flyTo({ x: -100, z: -100 }, 100);
  c.update(0.2);
  c.flyTo({ x: 300, z: 400 }, 200);
  c.update(1);
  expect(c.readState()).toMatchObject({ x: 300, z: 400, distance: 200 });
});
it('samples focus height and raises the camera above terrain even after terrain changes', () => {
  let raised = false;
  const c = make({
    heightAt: (x, z) =>
      raised ? 400 : Math.abs(x) + Math.abs(z) > 30 ? 250 : 20,
  });
  expect(c.camera.position.y).toBeGreaterThanOrEqual(255);
  expect(c.copyFocus(new Vector3()).y).toBe(20);
  raised = true;
  c.update(0);
  expect(c.camera.position.y).toBeGreaterThanOrEqual(405);
  expect(c.copyFocus(new Vector3()).y).toBe(400);
});
it.each([
  ['flat', () => 0],
  ['slope', (x: number, z: number) => 0.15 * x + 0.08 * z],
  ['hill', (x: number, z: number) => 30 * Math.exp(-(x * x + z * z) / 50000)],
] as const)(
  'keeps a terrain point at its NDC anchor on every zoom frame: %s',
  (_, heightAt) => {
    const c = make({ heightAt, initial: { elevation: 0.7 } }),
      ndc = { x: 0.35, y: -0.3 },
      hit = new Vector3();
    expect(c.groundAt(ndc, hit)).toBe(true);
    const fixed = hit.clone();
    c.zoom(0.45, ndc);
    for (let i = 0; i < 90; i++) {
      c.update(1 / 60);
      const projection = fixed.clone().project(c.camera);
      expect(projection.x).toBeCloseTo(ndc.x, 5);
      expect(projection.y).toBeCloseTo(ndc.y, 5);
    }
    c.zoom(3, ndc);
    for (let i = 0; i < 90; i++) {
      c.update(1 / 60);
      const projection = fixed.clone().project(c.camera);
      expect(projection.x).toBeCloseTo(ndc.x, 5);
      expect(projection.y).toBeCloseTo(ndc.y, 5);
    }
  },
);
it('handles repeated zooms, distance limits, no-hit anchors and boundary constraints', () => {
  const c = make({ initial: { elevation: 0.7 } }),
    p = { x: -0.2, y: -0.2 },
    hit = new Vector3();
  expect(c.groundAt(p, hit)).toBe(true);
  c.zoom(0.8, p);
  c.update(0.1);
  c.zoom(0.8, p);
  settle(c);
  expect(hit.clone().project(c.camera).x).toBeCloseTo(p.x, 5);
  c.zoom(1e-9, p);
  settle(c);
  expect(c.readState().distance).toBeCloseTo(20);
  expect(hit.clone().project(c.camera).y).toBeCloseTo(p.y, 5);
  const sky = make();
  expect(sky.groundAt({ x: 0, y: 1 }, new Vector3())).toBe(false);
  sky.zoom(0.8, { x: 0, y: 1 });
  settle(sky);
  expect(sky.readState().distance).toBeLessThan(CAMERA.initialDistanceM);
  const edge = make({ initial: { x: 2400, z: 2400, elevation: 0.7 } });
  edge.zoom(4, { x: 1, y: -1 });
  settle(edge);
  expect(edge.readState().x).toBeLessThanOrEqual(2400);
  expect(edge.readState().z).toBeLessThanOrEqual(2400);
});
it('returns accurate ground hits and detached snapshots; resize cancels old screen anchor', () => {
  const c = make(),
    hit = new Vector3();
  expect(c.groundAt({ x: 0, y: 0 }, hit)).toBe(true);
  expect(hit.length()).toBeLessThan(1e-7);
  const state = c.readState();
  state.x = 9999;
  expect(c.readState().x).toBe(0);
  c.zoom(0.8, { x: 0.3, y: -0.3 });
  c.resize(0.5);
  c.update(0.2);
  expect(c.camera.aspect).toBe(0.5);
  expect(c.camera.fov).toBe(45);
  expect(c.camera.position.toArray().every(Number.isFinite)).toBe(true);
  c.camera.far = 1;
  expect(c.groundAt({ x: 0, y: 0 }, hit)).toBe(false);
});
it('rejects invalid parameters without poisoning the current pose', () => {
  const c = make();
  for (const value of [NaN, Infinity]) {
    expect(() => c.pan(value, 0)).toThrow(RangeError);
    expect(() => c.rotate(value)).toThrow(RangeError);
    expect(() => c.tilt(value)).toThrow(RangeError);
    expect(() => c.flyTo({ x: value, z: 0 }, 10)).toThrow(RangeError);
    expect(() => c.groundAt({ x: value, y: 0 }, new Vector3())).toThrow(
      RangeError,
    );
  }
  for (const value of [-1, 0, NaN, Infinity]) {
    expect(() => c.zoom(value)).toThrow(RangeError);
    expect(() => c.resize(value)).toThrow(RangeError);
  }
  expect(() => c.update(-1)).toThrow(RangeError);
  expect(() => c.update(NaN)).toThrow(RangeError);
  expect(() => make({ initial: { x: NaN } })).toThrow(RangeError);
  expect(() => make({ heightAt: () => NaN })).toThrow(RangeError);
  expect(() => make({ bounds: { ...bounds, minX: 2400 } })).toThrow(RangeError);
  c.update(0);
  expect(c.camera.position.toArray().every(Number.isFinite)).toBe(true);
});
