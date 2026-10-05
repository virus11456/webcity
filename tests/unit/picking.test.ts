import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Ray, Vector3 } from 'three';
import { TerrainPicker } from '../../src/input/picking';
import { meshHeightAt } from '../../src/world/heightField';
import { PickingMarker } from '../../src/render/terrain/pickingMarker';
import { PICKING } from '../../src/data/picking';
import { WORLD } from '../../src/data/config';

function field(height: (x: number, z: number) => number) {
  const heights = new Float32Array(WORLD.heightmapVertices ** 2);
  for (let j = 0; j < 301; j++)
    for (let i = 0; i < 301; i++)
      heights[j * 301 + i] = height(i * 16 - 2400, j * 16 - 2400);
  return { heights, revision: 0 };
}
const flat = field(() => 58);
describe('terrain picking', () => {
  it('returns precise coordinates, row-major cells and central tile ownership', () => {
    const p = new TerrainPicker(flat);
    const hit = p.raycast(
      { x: -0.1, y: 200, z: 8.1 },
      { x: 0, y: -2, z: 0 },
      1000,
    )!;
    expect(hit.world).toEqual({ x: -0.1, y: 58, z: 8.1 });
    expect(hit.distance).toBeCloseTo(142, 3);
    expect(hit.cell).toEqual({ x: 299, z: 301, index: 301 * 600 + 299 });
    expect(hit.tile).toEqual({ x: 2, z: 2, index: 12 });
    expect(hit.owned).toBe(true);
    expect(
      p.raycast({ x: 480, y: 200, z: 0 }, { x: 0, y: -1, z: 0 }, 1000)!.owned,
    ).toBe(false);
    expect(
      new TerrainPicker(flat, (index) => index === 13).raycast(
        { x: 480, y: 200, z: 0 },
        { x: 0, y: -1, z: 0 },
        1000,
      )!.owned,
    ).toBe(true);
  });
  it.each([-2399.9, -1888, -864, 0, 672, 2399.9])(
    'handles map and chunk edges at x=%s',
    (x) => {
      const hit = new TerrainPicker(flat).raycast(
        { x, y: 150, z: 0 },
        { x: 0, y: -1, z: 0 },
        1000,
      )!;
      expect(hit.world.x).toBe(x);
      expect(hit.world.y).toBe(58);
      expect(hit.cell.x).toBeGreaterThanOrEqual(0);
      expect(hit.cell.x).toBeLessThan(600);
    },
  );
  it('rejects sky, outside, zero rays, invalid input and a hit beyond the far plane', () => {
    const p = new TerrainPicker(flat);
    for (const scale of [1e-200, 1e200])
      expect(
        p.raycast({ x: 0, y: 200, z: 0 }, { x: 0, y: -scale, z: 0 }, 1000)!
          .distance,
      ).toBeCloseTo(142, 3);

    expect(
      p.raycast({ x: 0, y: 200, z: 0 }, { x: 0, y: 1, z: 0 }, 1000),
    ).toBeNull();
    expect(
      p.raycast({ x: 2401, y: 200, z: 0 }, { x: 0, y: -1, z: 0 }, 1000),
    ).toBeNull();
    expect(
      p.raycast({ x: 2400, y: 200, z: 0 }, { x: 0, y: -1, z: 0 }, 1000),
    ).toBeNull();
    expect(
      p.raycast({ x: 0, y: 200, z: 0 }, { x: 0, y: 0, z: 0 }, 1000),
    ).toBeNull();
    expect(
      p.raycast({ x: NaN, y: 200, z: 0 }, { x: 0, y: -1, z: 0 }, 1000),
    ).toBeNull();
    expect(
      p.raycast({ x: 0, y: 200, z: 0 }, { x: 0, y: -1, z: 0 }, 100),
    ).toBeNull();
  });
  it('matches analytic sloping-plane intersections from oblique and nearly horizontal rays', () => {
    const p = new TerrainPicker(field((x, z) => 100 + 0.04 * x - 0.02 * z));
    for (const [origin, direction] of [
      [new Vector3(-900, 300, 500), new Vector3(1, -0.3, -0.2).normalize()],
      [new Vector3(-2200, 15, 0), new Vector3(1, -0.001, 0).normalize()],
    ]) {
      const t =
        (100 + 0.04 * origin!.x - 0.02 * origin!.z - origin!.y) /
        (direction!.y - 0.04 * direction!.x + 0.02 * direction!.z);
      const expected = origin!.clone().addScaledVector(direction!, t);
      const hit = p.raycast(origin!, direction!, 10000)!;
      expect(
        new Vector3(hit.world.x, hit.world.y, hit.world.z).distanceTo(expected),
      ).toBeLessThan(0.5);
    }
  });
  it('finds the nearest hill when the ray crosses more than one surface', () => {
    const heights = field(
      (x) =>
        50 +
        Math.max(0, 1 - Math.abs(x + 500) / 120) * 150 +
        Math.max(0, 1 - Math.abs(x - 500) / 120) * 150,
    );
    const ray = new Ray(
      new Vector3(-1800, 130, 0),
      new Vector3(1, -0.01, 0).normalize(),
    );
    const hit = new TerrainPicker(heights).raycast(
      ray.origin,
      ray.direction,
      5000,
    )!;
    // Independent exact triangle intersection reference along this mesh row.
    let nearest = Infinity;
    const point = new Vector3();
    for (let i = 0; i < 300; i++) {
      const x = -2400 + i * 16;
      const a = new Vector3(x, meshHeightAt(heights.heights, x, 0), 0);
      const b = new Vector3(
        x + 16,
        meshHeightAt(heights.heights, x + 16, 0),
        0,
      );
      const c = new Vector3(x, meshHeightAt(heights.heights, x, 16), 16);
      if (ray.intersectTriangle(a, c, b, false, point))
        nearest = Math.min(nearest, point.distanceTo(ray.origin));
    }
    expect(Math.abs(hit.distance - nearest)).toBeLessThan(0.5);
    expect(hit.world.x).toBeLessThan(0);
  });
  it('does not skip a near-tangent ridge thinner than the marching step', () => {
    const ridge = field((x) => (x === 0 ? 200 : 0));
    const hit = new TerrainPicker(ridge).raycast(
      { x: -1, y: 199.99, z: 3 },
      { x: 1, y: 0, z: 0 },
      100,
    )!;
    expect(hit).not.toBeNull();
    expect(hit.world.x).toBeCloseTo(-0.0008, 3);
  });
  it('refits bounds after terrain edits and reuses its result object', () => {
    const f = field(() => 58),
      p = new TerrainPicker(f);
    const first = p.raycast(
      { x: 0, y: 300, z: 0 },
      { x: 0, y: -1, z: 0 },
      1000,
    )!;
    f.heights.fill(180);
    f.revision++;
    const next = p.raycast(
      { x: 0, y: 300, z: 0 },
      { x: 0, y: -1, z: 0 },
      1000,
    )!;
    expect(next).toBe(first);
    expect(next.world.y).toBe(180);
  });
  it('converts CSS client coordinates with viewport offset and excludes coordinates outside the canvas', () => {
    const camera = new PerspectiveCamera(45, 2, 1, 1000);
    camera.position.set(0, 200, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    const rect = { left: 40, top: 25, width: 800, height: 400 },
      p = new TerrainPicker(flat);
    const hit = p.pick(440, 225, rect, camera, 1000)!;
    expect(hit.world.x).toBeCloseTo(0);
    expect(hit.world.z).toBeCloseTo(0);
    expect(hit.world.y).toBe(58);
    expect(p.pick(39, 225, rect, camera, 1000)).toBeNull();
    expect(p.pick(840, 225, rect, camera, 1000)).toBeNull();
    expect(p.pick(440, 225, { ...rect, width: 0 }, camera, 1000)).toBeNull();
  });
  it('samples both rendered triangle halves and aligns every marker vertex on a steep cell', () => {
    const f = field(() => 0);
    const k = 150 * 301 + 150;
    f.heights[k] = 10;
    f.heights[k + 1] = 30;
    f.heights[k + 301] = 50;
    f.heights[k + 302] = 100;
    expect(meshHeightAt(f.heights, 4, 4)).toBe(25);
    expect(meshHeightAt(f.heights, 12, 12)).toBe(70);
    const p = new TerrainPicker(f),
      hit = p.raycast({ x: 9, y: 200, z: 9 }, { x: 0, y: -1, z: 0 }, 1000)!;
    const marker = new PickingMarker(f);
    marker.update(hit);
    const attr = marker.line.geometry.getAttribute('position');
    for (let i = 0; i < attr.count; i++)
      expect(
        attr.getY(i) - meshHeightAt(f.heights, attr.getX(i), attr.getZ(i)),
      ).toBeCloseTo(PICKING.markerLiftM, 4);
    expect(marker.line.visible).toBe(true);
    marker.update(null);
    expect(marker.line.visible).toBe(false);
    marker.dispose();
  });
});
