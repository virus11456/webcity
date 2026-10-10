import { describe, expect, it } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import {
  VehicleRenderer,
  vehicleGeometry,
  vehicleColor,
} from '../../src/render/vehicles';
import type { SimEvent } from '../../src/bridge/protocol';
function frame(
  tick: number,
  x: number,
  yaw = 0,
  count = 1,
  kind = 0,
): SimEvent {
  const data = new Float32Array(count * 10);
  for (let i = 0; i < count; i++)
    data.set(
      [
        i + 1,
        i + 100,
        kind,
        x + (i % 30) * 2,
        0,
        Math.floor(i / 30) * 2,
        yaw,
        10,
        4.4,
        500 + i,
      ],
      i * 10,
    );
  return { t: 'vehicles', tick, speed: 1, count, data };
}
function fixture() {
  const scene = new Scene(),
    r = new VehicleRenderer(scene),
    camera = new PerspectiveCamera(65, 1, 0.1, 2000);
  camera.position.set(0, 60, 70);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { scene, r, camera };
}
describe('instanced personal vehicles', () => {
  it('interpolates position and shortest heading without restarting on repeated 50 ms frames', () => {
    const { r, camera } = fixture();
    r.accept(frame(10, 0, Math.PI - 0.1));
    r.update(0.24, camera);
    r.accept(frame(11, 12, -Math.PI + 0.1));
    r.update(0.12, camera);
    expect(r.sample(1)!.x).toBeCloseTo(6);
    expect(Math.abs(r.sample(1)!.yaw)).toBeCloseTo(Math.PI);
    r.accept(frame(11, 12, -Math.PI + 0.1));
    r.update(0.12, camera);
    expect(r.sample(1)!.x).toBeCloseTo(12);
    r.dispose();
  });
  it('keeps independent identity and destinations through distance culling and clears finished agents', () => {
    const { r, camera } = fixture();
    r.accept(frame(1, 0, 0, 2));
    r.update(0.3, camera);
    expect(r.sample(1)!.destinationId).toBe(500);
    expect(r.sample(2)!.destinationId).toBe(501);
    camera.position.set(0, 1200, 0);
    camera.updateMatrixWorld();
    r.update(0.2, camera);
    expect(r.stats().visible).toBe(0);
    expect(r.stats().agents).toBe(2);
    r.accept(frame(2, 0, 0, 0));
    r.update(0.2, camera);
    expect(r.stats().agents).toBe(0);
    expect(r.stats().batches).toBe(0);
    r.dispose();
  });
  it('renders 1000 cars in one batch and pedestrians only at close range', () => {
    const { r, camera } = fixture();
    camera.position.set(30, 150, 150);
    camera.lookAt(30, 0, 30);
    camera.updateMatrixWorld();
    r.accept(frame(1, 0, 0, 1000));
    r.update(0.3, camera);
    expect(r.stats()).toMatchObject({
      agents: 1000,
      visible: 1000,
      batches: 1,
    });
    r.accept(frame(2, 0, 0, 1, 8));
    r.update(0.3, camera);
    expect(r.stats().visible).toBe(0);
    camera.position.set(0, 50, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    r.update(0.3, camera);
    expect(r.stats().visible).toBe(1);
    r.dispose();
    expect(r.group.parent).toBeNull();
  });
  it('builds original bounded geometry and deterministic weighted colors', () => {
    for (let kind = 0; kind < 9; kind++) {
      const a = vehicleGeometry(kind, false),
        b = vehicleGeometry(kind, true);
      expect(a.getAttribute('position').count).toBeGreaterThan(0);
      expect(a.getAttribute('color').count).toBe(
        a.getAttribute('position').count,
      );
      expect(b.getAttribute('position').count).toBeLessThanOrEqual(
        a.getAttribute('position').count,
      );
      a.dispose();
      b.dispose();
    }
    expect(vehicleColor(10, 0)).toBe(vehicleColor(10, 0));
    expect(vehicleColor(10, 3)).not.toBe(vehicleColor(10, 4));
  });
  it('selects visible citizens at their interpolated screen positions', () => {
    const { r, camera } = fixture();
    r.accept(frame(1, 0));
    r.update(0.3, camera);
    const p = camera.position.clone().set(0, 0.8, 0).project(camera);
    expect(r.pick((p.x + 1) * 200, (1 - p.y) * 200, 400, 400, camera)).toBe(1);
    expect(r.pick(0, 0, 400, 400, camera)).toBeNull();
    r.dispose();
  });
});
