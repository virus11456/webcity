import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { lerp } from '../../src/core/math';
import { ROAD_RULES } from '../../src/data/roads';
import { MAP_SIZE, WORLD } from '../../src/data/config';
import {
  previewStraightRoad,
  snapRoadPoint,
} from '../../src/world/roadGeometry';
import { isRoadDraft } from '../../src/world/roadConstruction';
import { roadArms } from '../../src/render/roads/geometry';
import { bridgeMesh } from '../../src/render/roads/structures';
import { serialize, deserialize } from '../../src/save/serializer';
import type { RoadDraft } from '../../src/world/snapshot';
const settings = {
  seed: 1,
  mapId: 'valley',
  cityName: 'Bridges',
  mode: 'normal' as const,
};
const p = (x: number, z: number) => ({ x, z });
const draft = (
  start = p(-160, 0),
  end = p(160, 0),
  h?: [number, number],
): RoadDraft => ({
  start,
  end,
  c1: lerp(start, end, 1 / 3),
  c2: lerp(start, end, 2 / 3),
  elevated: Boolean(h),
  ...(h ? { startHeight: h[0], endHeight: h[1] } : {}),
});
function initial(river = false) {
  const s = new Simulation(settings).snapshot();
  s.terrain.heights.fill(60);
  s.unlocked = [0, 1, 2, 3, 4];
  if (river)
    for (let z = 0; z < WORLD.heightmapVertices; z++)
      for (let x = 0; x < WORLD.heightmapVertices; x++)
        if (Math.abs(x * WORLD.heightmapSpacingM - MAP_SIZE / 2) < 40)
          s.terrain.heights[z * WORLD.heightmapVertices + x] = 35;
  return s;
}
describe('bridges and grades', () => {
  it('automatically spans water at triple price, preserves riverbed and creates no zoning', async () => {
    const s = initial(true),
      sim = new Simulation(settings, undefined, s);
    expect(sim.buildRoad('road_small', draft())).toEqual({
      ok: true,
      cost: 2400,
    });
    const after = sim.snapshot();
    expect(after.segments[0]!.elevated).toBe(true);
    expect(after.nodes.map((n) => n.height)).toEqual([60, 60]);
    expect(after.terrain.heights).toEqual(s.terrain.heights);
    expect(after.zoneBlocks).toHaveLength(0);
    const saved = await deserialize(await serialize(after));
    expect(saved.segments).toEqual(after.segments);
    const world = {
        ...after,
        heights: after.terrain.heights,
        mode: after.settings.mode,
      },
      arms = roadArms(world.nodes, world.segments),
      r = world.segments[0]!;
    const mesh = bridgeMesh(
      arms.get(r.start)![0]!,
      arms.get(r.end)![0]!,
      world,
    );
    expect(mesh.positions.length).toBeGreaterThan(1000);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(Math.min(...mesh.positions.filter((_, i) => i % 3 === 1))).toBe(35);
  });
  it('keeps two vertical levels separate and connects a legal ramp to an elevated node', () => {
    const sim = new Simulation(settings, undefined, initial());
    expect(sim.buildRoad('road_small', draft(p(-200, 0), p(200, 0))).ok).toBe(
      true,
    );
    expect(
      sim.buildRoad('highway', draft(p(0, -160), p(0, 160), [72, 72])).ok,
    ).toBe(true);
    const s = sim.snapshot();
    expect(s.segments).toHaveLength(2);
    expect(s.nodes).toHaveLength(4);
    expect(
      sim.buildRoad('highway_ramp', draft(p(-240, -160), p(0, -160), [60, 72]))
        .ok,
    ).toBe(true);
    expect(
      sim.snapshot().nodes.filter((n) => n.segments.length === 2),
    ).toHaveLength(1);
    const world = { ...s, heights: s.terrain.heights, mode: s.settings.mode };
    expect(snapRoadPoint(p(0, -160), world, true, 72).height).toBe(72);
    expect(snapRoadPoint(p(0, -160), world).kind).toBe('none');
  });
  it('enforces the same clearance when building below an existing viaduct', () => {
    const sim = new Simulation(settings, undefined, initial());
    expect(
      sim.buildRoad('road_small', draft(p(0, -160), p(0, 160), [63, 63])).ok,
    ).toBe(true);
    expect(sim.buildRoad('road_small', draft()).reason).toBe(
      'err.roadClearance',
    );
  });
  it('rejects steep grades, excessive height, buried decks and underwater endpoints', () => {
    const s = initial(),
      w = { ...s, heights: s.terrain.heights };
    const quote = (
      a: number,
      b: number,
      type: 'road_small' | 'highway' = 'road_small',
    ) =>
      previewStraightRoad(
        { type, start: p(-80, 0), end: p(80, 0), startHeight: a, endHeight: b },
        w,
      );
    expect(quote(60, 78, 'highway').reason).toBe('err.slopeTooSteep');
    expect(quote(60, 78).canBuild).toBe(true);
    expect(quote(91, 91).reason).toBe('err.elevationTooHigh');
    expect(quote(59, 72).reason).toBe('err.roadClearance');
    expect(quote(60, 90).reason).toBe('err.slopeTooSteep');
    const r = initial(true);
    const sim = new Simulation(settings, undefined, r);
    expect(sim.buildRoad('road_small', draft(p(0, 0), p(160, 0))).reason).toBe(
      'err.roadInWater',
    );
    expect(isRoadDraft({ ...draft(), elevated: true })).toBe(false);
    expect(isRoadDraft(draft(p(-80, 0), p(80, 0), [60, NaN]))).toBe(false);
    expect(ROAD_RULES.elevatedUpkeepMultiplier).toBe(2);
  });
  it('upgrades an elevated road with elevated difference instead of dropping it to ground', () => {
    const sim = new Simulation(settings, undefined, initial());
    expect(
      sim.buildRoad('gravel', draft(p(-80, 0), p(80, 0), [72, 72])).ok,
    ).toBe(true);
    const id = sim.snapshot().segments[0]!.id;
    expect(sim.upgradeRoad(id, 'road_small')).toEqual({ ok: true, cost: 720 });
    expect(sim.snapshot().nodes.every((n) => n.height === 72)).toBe(true);
  });
});
