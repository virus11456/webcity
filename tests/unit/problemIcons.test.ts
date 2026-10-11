import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Texture } from 'three';
import { ProblemIcons } from '../../src/render/icons';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { PROBLEM_ICONS } from '../../src/data/problemIcons';
const b = () => ({
  ...districtFixture(1)[0]!,
  kind: 'zoned' as const,
  state: 'active' as const,
  flags: 0,
  households: 2,
});
function setup() {
  const group = new Group(),
    texture = new Texture();
  const r = new ProblemIcons(
    group,
    (id, out) => {
      out.set((id % 20) * 50 - 475, 0, Math.floor(id / 20) * 50 - 475);
      return true;
    },
    texture,
  );
  const camera = new PerspectiveCamera(60, 1, 1, 5000);
  camera.position.set(0, 900, 900);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { r, camera, texture, group };
}
describe('batched problem billboards', () => {
  it('keeps partial updates for healthy buildings and removes/rebuilds records correctly', () => {
    const { r, camera } = setup();
    const building = { ...b(), id: 210, flags: 7 };
    r.reset([building]);
    r.update(0, camera, 900, 900);
    expect(r.readStats().visible).toBe(0);
    r.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: [{ id: 210, flags: 6 }],
    });
    r.update(0, camera, 900, 900);
    expect(r.readStats().visible).toBe(1);
    r.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: [{ id: 210, flags: 7 }],
    });
    r.update(0, camera, 900, 900);
    expect(r.readStats().visible).toBe(0);
    r.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: [{ id: 210, state: 'abandoned' }],
    });
    r.update(0, camera, 900, 900);
    expect(r.readStats().visible).toBe(1);
    r.accept({ t: 'buildingsChanged', added: [], removed: [210], updated: [] });
    r.update(0, camera, 900, 900);
    expect(r.readStats().visible).toBe(0);
    r.dispose();
  });
  it('caps at 300, spaces overlapping projections, and hides beyond 1500m or behind camera', () => {
    const { r, camera } = setup();
    r.reset(Array.from({ length: 1000 }, (_, id) => ({ ...b(), id })));
    r.update(0.016, camera, 900, 900);
    expect(r.readStats().visible).toBeGreaterThan(0);
    expect(r.readStats().visible).toBeLessThanOrEqual(PROBLEM_ICONS.limit);
    expect(r.group.children).toHaveLength(1);
    camera.position.set(0, 2000, 4000);
    camera.lookAt(0, 0, 0);
    r.update(0.016, camera, 900, 900);
    expect(r.readStats().visible).toBe(0);
    camera.position.set(0, 900, 900);
    camera.lookAt(0, 900, 2000);
    r.update(0.016, camera, 900, 900);
    expect(r.readStats().visible).toBe(0);
    r.dispose();
  });
  it('coalesces coincident roofs and disposes shared resources exactly once', () => {
    const group = new Group(),
      texture = new Texture();
    const r = new ProblemIcons(
      group,
      (_, out) => {
        out.set(0, 0, 0);
        return true;
      },
      texture,
    );
    const camera = new PerspectiveCamera(60, 1, 1, 5000);
    camera.position.set(0, 100, 100);
    camera.lookAt(0, 0, 0);
    r.reset(Array.from({ length: 400 }, (_, id) => ({ ...b(), id })));
    r.update(0.016, camera, 900, 900);
    expect(r.readStats().visible).toBe(1);
    const checks = [
      vi.spyOn(texture, 'dispose'),
      vi.spyOn(r.geometry, 'dispose'),
      vi.spyOn(r.material, 'dispose'),
    ];
    r.dispose();
    r.dispose();
    expect(checks.every((f) => f.mock.calls.length === 1)).toBe(true);
    expect(group.children).toHaveLength(0);
  });
});

it('renders crime at the exact threshold and clears it from a partial crime patch', () => {
  const { r, camera } = setup();
  r.reset([{ ...b(), id: 210, flags: 7, crime: 80 }]);
  r.update(0, camera, 900, 900);
  expect(r.readStats().visible).toBe(1);
  expect(r.geometry.getAttribute('tile').getX(0)).toBe(7);
  expect(r.material.vertexShader).toContain('(uv.x+tile)/11.0');
  r.accept({
    t: 'buildingsChanged',
    added: [],
    removed: [],
    updated: [{ id: 210, crime: 79.9 }],
  });
  r.update(0, camera, 900, 900);
  expect(r.readStats().visible).toBe(0);
  r.dispose();
});

it('positions a crime warning above a public facility without a zoned-building mesh', () => {
  const group = new Group(),
    camera = new PerspectiveCamera(60, 1, 1, 5000),
    r = new ProblemIcons(
      group,
      () => false,
      new Texture(),
      () => 60,
    );
  camera.position.set(0, 300, 400);
  camera.lookAt(0, 60, 0);
  camera.updateMatrixWorld();
  r.reset([
    {
      ...b(),
      kind: 'service',
      defId: 'clinic',
      pos: { x: 0, z: 0 },
      rotation: 0,
      crime: 80,
    },
  ]);
  r.update(0, camera, 900, 900);
  expect(r.readStats().visible).toBe(1);
  expect(r.geometry.getAttribute('anchor').getY(0)).toBe(
    60 + PROBLEM_ICONS.facilityHeightM + PROBLEM_ICONS.roofGapM,
  );
  r.dispose();
});
