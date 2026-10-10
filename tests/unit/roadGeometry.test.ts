import { describe, expect, it } from 'vitest';
import { MAP_SIZE, WORLD } from '../../src/data/config';
import { ROADS, type RoadTypeId } from '../../src/data/roads';
import { distance } from '../../src/core/math';
import { meshHeightAt } from '../../src/world/heightField';
import { RoadGraph } from '../../src/world/roadGraph';
import { Terrain } from '../../src/world/terrain';
import { MAP_PRESETS } from '../../src/data/terrain';
import {
  previewStraightRoad,
  roadConstructionCost,
  snapRoadPoint,
  snapRoadVector,
  type RoadGeometryWorld,
  type RoadBuildReason,
  type StraightRoadRequest,
} from '../../src/world/roadGeometry';
import { t } from '../../src/ui/i18n/t';

const p = (x: number, z: number) => ({ x, z });
function world(graph = new RoadGraph()): RoadGeometryWorld {
  return {
    ...graph.snapshot(),
    heights: new Float32Array(WORLD.heightmapVertices ** 2).fill(60),
    ownedTiles: [12],
    buildings: [],
  };
}
function terrain(w: RoadGeometryWorld, fn: (x: number, z: number) => number) {
  for (let z = 0; z < WORLD.heightmapVertices; z++)
    for (let x = 0; x < WORLD.heightmapVertices; x++)
      w.heights[z * WORLD.heightmapVertices + x] = fn(
        x * WORLD.heightmapSpacingM - MAP_SIZE / 2,
        z * WORLD.heightmapSpacingM - MAP_SIZE / 2,
      );
}
const raw = { angle: false, length: false, connections: false };
const request = (
  start = p(0, 0),
  end = p(80, 0),
  extra: Partial<StraightRoadRequest> = {},
): StraightRoadRequest => ({
  start,
  end,
  type: 'road_small',
  snap: raw,
  ...extra,
});
const add = (
  g: RoadGraph,
  start: ReturnType<typeof p>,
  end: ReturnType<typeof p>,
) =>
  g.addRoad({
    start,
    end,
    startHeight: 60,
    endHeight: 60,
    type: 'road_small',
    builtDay: 2,
  });
function failure(
  w: RoadGeometryWorld,
  input: StraightRoadRequest,
  reason: RoadBuildReason,
) {
  const result = previewStraightRoad(input, w);
  expect(result.canBuild).toBe(false);
  expect(result.reason).toBe(reason);
  expect(t(reason)).not.toBe(reason);
  return result;
}

describe('straight road snapping', () => {
  it('snaps angle to 15 degrees and length to 8 metres', () => {
    const end = p(
      50 * Math.cos((20 * Math.PI) / 180),
      50 * Math.sin((20 * Math.PI) / 180),
    );
    const result = snapRoadVector(p(0, 0), end);
    expect(distance(p(0, 0), result)).toBeCloseTo(48);
    expect((Math.atan2(result.z, result.x) * 180) / Math.PI).toBeCloseTo(15);
  });
  it('independently disables angle and length snapping; zero stays zero', () => {
    const end = p(37, 11);
    expect(snapRoadVector(p(0, 0), end, 0, raw)).toEqual(end);
    expect(
      distance(p(0, 0), snapRoadVector(p(0, 0), end, 0, { length: false })),
    ).toBeCloseTo(distance(p(0, 0), end));
    const angleOnlyOff = snapRoadVector(p(0, 0), end, 0, { angle: false });
    expect(angleOnlyOff.z / angleOnlyOff.x).toBeCloseTo(11 / 37);
    expect(snapRoadVector(p(1, 1), p(1, 1))).toEqual(p(1, 1));
  });
  it('snaps relative to an existing diagonal road rather than world axes', () => {
    const g = new RoadGraph();
    const angle = (22 * Math.PI) / 180;
    add(g, p(-80 * Math.cos(angle), -80 * Math.sin(angle)), p(0, 0));
    const input = request(
      p(1, 1),
      p(80 * Math.cos(angle + Math.PI / 3), 80 * Math.sin(angle + Math.PI / 3)),
      { snap: {} },
    );
    const result = previewStraightRoad(input, world(g));
    expect(result.canBuild).toBe(true);
    expect(result.preview!.start.kind).toBe('node');
    expect(
      (Math.atan2(result.preview!.end.pos.z, result.preview!.end.pos.x) * 180) /
        Math.PI,
    ).toBeCloseTo(82);
  });
  it('prioritizes nodes, uses nearest then ID, and excludes exactly 8 metres', () => {
    const g = new RoadGraph();
    g.addNode(p(-4, 0), 60);
    g.addNode(p(4, 0), 60);
    const w = world(g);
    expect(snapRoadPoint(p(0, 0), w).id).toBe(1);
    expect(snapRoadPoint(p(1, 0), w).id).toBe(2);
    expect(snapRoadPoint(p(4, 8), w).kind).toBe('none');
    expect(snapRoadPoint(p(1, 0), w, false).kind).toBe('none');
    w.nodes.reverse();
    expect(snapRoadPoint(p(0, 0), w).id).toBe(1);
  });
  it('node priority beats a closer segment and returns independent coordinates', () => {
    const g = new RoadGraph();
    add(g, p(-80, 0), p(80, 0));
    g.addNode(p(0, 7), 60);
    const w = world(g),
      result = snapRoadPoint(p(0, 1), w);
    expect(result.kind).toBe('node');
    result.pos.x = 999;
    expect(w.nodes.at(-1)!.pos.x).toBe(0);
  });
  it('projects onto a road interior and interpolates height', () => {
    const g = new RoadGraph();
    g.addRoad({
      start: p(0, 0),
      end: p(80, 0),
      startHeight: 60,
      endHeight: 64,
      type: 'road_small',
      builtDay: 0,
    });
    const w = world(g);
    expect(snapRoadPoint(p(40, 7.99), w)).toMatchObject({
      kind: 'segment',
      pos: p(40, 0),
      height: 62,
    });
    expect(snapRoadPoint(p(40, 8), w).kind).toBe('none');
  });
  it('does not connect to an elevated road or off-ground node', () => {
    const g = new RoadGraph();
    g.addRoad({
      start: p(0, 0),
      end: p(80, 0),
      startHeight: 75,
      endHeight: 75,
      type: 'road_small',
      builtDay: 0,
      elevated: true,
    });
    const w = world(g);
    expect(snapRoadPoint(p(0, 1), w).kind).toBe('none');
    expect(snapRoadPoint(p(40, 1), w).kind).toBe('none');
  });
  it('keeps exact T-junction connections instead of rounding off the road', () => {
    const g = new RoadGraph();
    add(g, p(-80, 0), p(80, 0));
    const result = previewStraightRoad(
      request(p(23, -73), p(23, -2), { snap: {} }),
      world(g),
    );
    expect(result.canBuild).toBe(true);
    expect(result.preview!.end.pos).toEqual(p(23, 0));
    expect(result.preview!.length).toBe(73);
    expect(result.preview!.cost).toBe(183);
  });
});

describe('road preview measurements and topology', () => {
  it.each(Object.keys(ROADS) as RoadTypeId[])(
    'calculates %s cost from its data definition',
    (type) => {
      expect(roadConstructionCost(type, 80)).toBe(ROADS[type].costPer8M * 10);
    },
  );
  it('rounds only final money, avoids floating-point overcharging and keeps cubic thirds', () => {
    expect(roadConstructionCost('road_small', 80 + 1e-12)).toBe(200);
    expect(roadConstructionCost('road_small', 81)).toBe(203);
    const result = previewStraightRoad(request(), world());
    expect(result).toMatchObject({
      canBuild: true,
      reason: null,
      preview: { length: 80, cost: 200, slope: 0 },
    });
    expect(result.preview!.draft.c1.x).toBeCloseTo(80 / 3);
    expect(result.preview!.draft.c2.x).toBeCloseTo(160 / 3);
  });
  it('reuses graph validation without mutating state or consuming IDs', () => {
    const g = new RoadGraph();
    add(g, p(-80, 0), p(80, 0));
    const w = world(g),
      before = g.snapshot();
    const result = previewStraightRoad(request(p(0, -80), p(0, 80)), w);
    expect(result.canBuild).toBe(true);
    expect({ nodes: w.nodes, segments: w.segments, nextId: w.nextId }).toEqual(
      before,
    );
    const dry = RoadGraph.previewRoad(before, {
      start: p(0, -80),
      end: p(0, 80),
      startHeight: 60,
      endHeight: 60,
      type: 'road_small',
      builtDay: 0,
    });
    expect(dry.added).toHaveLength(4);
    expect(g.snapshot()).toEqual(before);
    expect(
      g.addRoad({
        start: p(0, -80),
        end: p(0, 80),
        startHeight: 60,
        endHeight: 60,
        type: 'road_small',
        builtDay: 0,
      }),
    ).toEqual(dry);
  });
  it('reports too-short whole roads and split fragments', () => {
    const w = world();
    failure(w, request(p(0, 0), p(15.99, 0)), 'err.roadTooShort');
    expect(previewStraightRoad(request(p(0, 0), p(16, 0)), w).canBuild).toBe(
      true,
    );
    const g = new RoadGraph();
    add(g, p(0, 0), p(80, 0));
    failure(world(g), request(p(8, -80), p(8, 80)), 'err.roadTooShort');
  });
  it('reports overlapping roads and acute junctions as translated keys', () => {
    const g = new RoadGraph();
    add(g, p(0, 0), p(80, 0));
    failure(world(g), request(p(16, 0), p(64, 0)), 'err.roadOverlap');
    failure(world(g), request(p(0, 0), p(80, 20)), 'err.angleTooSmall');
  });
});

describe('full-footprint construction checks', () => {
  it.each(MAP_PRESETS)(
    'validates central roads on the generated $id terrain without modifying heights',
    (preset) => {
      const ground = new Terrain(preset.seed, preset);
      const w = world();
      w.heights = ground.heights;
      const input = request(p(-160, -100), p(-80, -100));
      const result = previewStraightRoad(input, w);
      expect(result.canBuild).toBe(true);
      expect(result.preview!.start.height).toBe(
        meshHeightAt(ground.heights, -160, -100),
      );
      expect(previewStraightRoad(input, w)).toEqual(result);
      expect(ground.revision).toBe(0);
    },
  );
  it('checks long diagonal corridors across terrain rows', () => {
    const w = world();
    w.ownedTiles = Array.from({ length: 25 }, (_, i) => i);
    const input = request(p(-2000, -2000), p(2000, 2000));
    expect(previewStraightRoad(input, w).canBuild).toBe(true);
    w.heights[150 * WORLD.heightmapVertices + 150] = 30;
    failure(w, input, 'err.roadInWater');
  });
  it('checks road width at the map boundary rather than clamping terrain reads', () => {
    const w = world();
    w.ownedTiles = Array.from({ length: 25 }, (_, i) => i);
    failure(w, request(p(2395, 0), p(2395, 80)), 'err.outsideMap');
    expect(
      previewStraightRoad(request(p(2392, 0), p(2392, 80)), w).canBuild,
    ).toBe(true);
    failure(w, request(p(2401, 0), p(2392, 80)), 'err.outsideMap');
  });
  it('checks unowned land under the road edges and allows shared boundary contact', () => {
    const w = world();
    failure(w, request(p(475, 0), p(475, 80)), 'err.landNotOwned');
    expect(
      previewStraightRoad(request(p(472, 0), p(472, 80)), w).canBuild,
    ).toBe(true);
    w.ownedTiles = [12, 13];
    expect(
      previewStraightRoad(request(p(475, 0), p(475, 80)), w).canBuild,
    ).toBe(true);
  });
  it('detects an unowned intermediate tile even if both endpoints are owned', () => {
    const w = world();
    w.ownedTiles = [11, 13];
    failure(w, request(p(-960, 0), p(960, 0)), 'err.landNotOwned');
  });
  it('rejects water in the middle while both endpoints are dry', () => {
    const w = world();
    terrain(w, (x) => (x === 32 ? 39 : 60));
    failure(w, request(), 'err.roadInWater');
  });
  it('detects a tiny wet triangle at the road edge with a dry centerline', () => {
    const w = world();
    // At z=8 the edge barely dips below sea level near x=32; center stays at 60.
    const row = (16 + MAP_SIZE / 2) / WORLD.heightmapSpacingM;
    const column = (32 + MAP_SIZE / 2) / WORLD.heightmapSpacingM;
    w.heights[row * WORLD.heightmapVertices + column] = 19.999;
    expect(meshHeightAt(w.heights, 32, 0)).toBe(60);
    failure(w, request(), 'err.roadInWater');
  });
  it('allows terrain exactly at sea level', () => {
    const w = world();
    w.heights.fill(40);
    expect(previewStraightRoad(request(), w).canBuild).toBe(true);
  });
  it.each(['road_small', 'highway', 'highway_ramp'] as const)(
    'uses the %s slope limit including downhill travel',
    (type) => {
      const limit = type === 'road_small' ? 0.12 : 0.06;
      const w = world();
      terrain(w, (x) => 100 + x * limit);
      const input = request(p(80, 0), p(0, 0), { type });
      expect(previewStraightRoad(input, w).canBuild).toBe(true);
      terrain(w, (x) => 100 + x * (limit + 0.001));
      failure(w, input, 'err.slopeTooSteep');
    },
  );
  it('detects an interior hill with equal-height endpoints and reports maximum grade', () => {
    const w = world();
    terrain(w, (x) => 60 + Math.max(0, 8 - Math.abs(x - 32) / 4));
    const result = failure(w, request(p(0, 0), p(64, 0)), 'err.slopeTooSteep');
    expect(result.preview!.start.height).toBe(result.preview!.end.height);
    expect(result.preview!.slope).toBeCloseTo(0.25);
  });
  it('allows the highway slope boundary despite Float32 rounding at high elevations', () => {
    const w = world();
    terrain(w, (x) => 350 + x * 0.06);
    expect(
      previewStraightRoad(request(p(0, 0), p(80, 0), { type: 'highway' }), w)
        .canBuild,
    ).toBe(true);
    terrain(w, (x) => 350 + x * 0.061);
    failure(
      w,
      request(p(0, 0), p(80, 0), { type: 'highway' }),
      'err.slopeTooSteep',
    );
  });
  it('uses longitudinal grade and the rendered triangle diagonal', () => {
    const w = world();
    terrain(w, (_x, z) => 100 + z * 0.2);
    expect(previewStraightRoad(request(), w).preview!.slope).toBe(0);
    expect(previewStraightRoad(request(), w).canBuild).toBe(true);
    failure(w, request(p(0, 0), p(0, 80)), 'err.slopeTooSteep');
  });
  it('checks the whole building lot, uses front-center origin, and permits boundary contact', () => {
    const w = world();
    w.buildings = [{ pos: p(32, 7), rotation: 0, lotW: 2, lotD: 3 }];
    failure(w, request(), 'err.buildingConflict');
    w.buildings = [{ pos: p(32, 8), rotation: 0, lotW: 2, lotD: 3 }];
    expect(previewStraightRoad(request(), w).canBuild).toBe(true);
    w.buildings = [{ pos: p(32, -32), rotation: 0, lotW: 2, lotD: 4 }];
    failure(w, request(), 'err.buildingConflict');
  });
  it('checks rotated building footprints, including road endpoints inside a lot', () => {
    const w = world();
    w.buildings = [{ pos: p(32, 20), rotation: Math.PI, lotW: 2, lotD: 4 }];
    failure(w, request(), 'err.buildingConflict');
    w.buildings = [{ pos: p(0, -8), rotation: Math.PI / 4, lotW: 4, lotD: 4 }];
    failure(w, request(p(0, 0), p(24, 0)), 'err.buildingConflict');
  });
  it('rejects invalid coordinates, unknown road types and malformed terrain', () => {
    const w = world();
    failure(w, request(p(NaN, 0)), 'err.invalidCommand');
    failure(w, request(p(0, Infinity)), 'err.invalidCommand');
    failure(
      w,
      request(p(0, 0), p(80, 0), { type: 'unknown' as RoadTypeId }),
      'err.invalidCommand',
    );
    w.heights[150 * WORLD.heightmapVertices + 152] = NaN;
    failure(w, request(), 'err.invalidCommand');
    w.heights = new Float32Array(0);
    failure(w, request(), 'err.invalidCommand');
  });
});
