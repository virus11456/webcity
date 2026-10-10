import { expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { RtsCamera } from '../../src/render/camera';
import { FollowCamera } from '../../src/render/followCamera';
import { CAMERA } from '../../src/data/rendering';
function setup() {
  const camera = new RtsCamera(new PerspectiveCamera(45, 1, 1, 6000), {
    bounds: { minX: -2400, maxX: 2400, minZ: -2400, maxZ: 2400 },
    heightAt: () => 60,
  });
  return camera;
}
it('smoothly follows a moving stable id and actual bridge height without restarting flights', () => {
  const camera = setup(),
    p = { x: 100, y: 84, z: 20 },
    changed: (number | null)[] = [],
    seen: number[] = [];
  const follow = new FollowCamera(
    camera,
    (id, out) => {
      seen.push(id);
      Object.assign(out, p);
      return true;
    },
    (id) => changed.push(id),
  );
  expect(follow.start(71)).toBe(true);
  const start = camera.readState().x;
  camera.update(1 / 60);
  expect(camera.readState().x).toBeGreaterThan(start);
  expect(camera.readState().x).toBeLessThan(p.x);
  for (let i = 0; i < 180; i++) {
    p.x += 0.1;
    follow.update();
    camera.update(1 / 60);
  }
  const s = camera.readState(),
    focus = new Vector3();
  camera.copyFocus(focus);
  expect(Math.abs(s.x - p.x)).toBeLessThan(1);
  expect(s.distance).toBeCloseTo(CAMERA.followDistanceM);
  expect(focus.y).toBeCloseTo(84);
  expect(new Set(seen)).toEqual(new Set([71]));
  expect(changed).toEqual([71]);
});
it('manual camera input and disappearance cancel, freeze the focus and do not select another agent', () => {
  const c = setup(),
    p = { x: 50, y: 60, z: 25 };
  let present = true;
  const changes: (number | null)[] = [];
  const f = new FollowCamera(
    c,
    (_, out) => {
      Object.assign(out, p);
      return present;
    },
    (id) => changes.push(id),
  );
  f.start(1);
  for (let i = 0; i < 90; i++) {
    f.update();
    c.update(1 / 60);
  }
  c.pan(10, 0);
  f.update();
  expect(f.id).toBeNull();
  expect(c.isTracking).toBe(false);
  const before = c.readState().x;
  c.update(0.1);
  expect(c.readState().x).toBeGreaterThan(before);
  f.start(2);
  present = false;
  f.update();
  expect(f.id).toBeNull();
  const stopped = c.readState();
  for (let i = 0; i < 60; i++) c.update(1 / 60);
  expect(c.readState()).toEqual(stopped);
  expect(f.start(99)).toBe(false);
  expect(changes).toEqual([1, null, 2, null]);
});
it('pause retains a stationary target and tracking is independent of frame rate', () => {
  const a = setup(),
    b = setup(),
    p = { x: 200, y: 60, z: 100 };
  a.track(p);
  b.track(p);
  for (let i = 0; i < 30; i++) a.update(1 / 30);
  for (let i = 0; i < 120; i++) b.update(1 / 120);
  expect(a.readState().x).toBeCloseTo(b.readState().x, 8);
  a.stopTracking();
  const s = a.readState();
  a.update(1);
  expect(a.readState()).toEqual(s);
  expect(() => b.track({ x: NaN, y: 60, z: 0 })).toThrow();
});
