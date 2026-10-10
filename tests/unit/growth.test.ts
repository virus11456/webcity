import { updateDemand } from '../../src/sim/systems/demand';
import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { WORLD, MAP_SIZE } from '../../src/data/config';
import {
  INITIAL_DEMAND,
  ZONES,
  ZONE_CODES,
  type ZoneType,
} from '../../src/data/zones';
import { LotFinder, lotPlacement } from '../../src/world/lots';
import {
  zoneBuildingFootprint,
  zonePolygonsOverlap,
  zoneTerrainValid,
} from '../../src/world/zoneGeometry';
import { zoneCellPolygon } from '../../src/world/zoneGrid';
import { GrowthSystem } from '../../src/sim/systems/growth';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { WorldMirror } from '../../src/bridge/mirror';
import { buildingsChangeFootprints } from '../../src/bridge/buildingChanges';
import { Matrix4, Vector3 } from 'three';
function fixture(zone: ZoneType = 'RL') {
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: 'Growth',
  });
  s.terrain.heights.fill(60);
  s.nextId = 10;
  s.nodes = [
    {
      id: 1,
      pos: { x: -160, z: 0 },
      height: 60,
      segments: [3],
      control: 'none',
    },
    {
      id: 2,
      pos: { x: 160, z: 0 },
      height: 60,
      segments: [3],
      control: 'none',
    },
  ];
  s.segments = [
    {
      id: 3,
      type: 'road_small',
      start: 1,
      end: 2,
      c1: { x: -50, z: 0 },
      c2: { x: 50, z: 0 },
      length: 320,
      elevated: false,
      builtDay: 0,
      zoneBlockIds: [4],
    },
  ];
  s.zoneBlocks = [
    {
      id: 4,
      segment: 3,
      side: 1,
      origin: { x: -152, z: 8 },
      dir: { x: 1, z: 0 },
      width: 38,
      cells: new Uint8Array(152).fill(ZONE_CODES[zone]),
      buildingAt: new Int32Array(152).fill(-1),
    },
  ];
  s.stats.demand = { R: 0, C: 0, I: 0, O: 0 };
  s.stats.demand[ZONES[zone].demand] = 100;
  return s;
}
function finder(s = fixture()) {
  return new LotFinder({
    ...s,
    heights: s.terrain.heights,
    mode: s.settings.mode,
  });
}
function tick(s: ReturnType<typeof fixture>, g: GrowthSystem, count = 1) {
  for (let i = 0; i < count; i++) {
    s.clock.ticks++;
    s.clock.day = Math.floor(s.clock.ticks / 10);
    g.tick(s);
  }
}
describe('legal roadside lots', () => {
  it('stops new construction when calculated commercial demand is zero and resumes after jobs are removed', () => {
    const s = fixture('CL'),
      g = new GrowthSystem();
    tick(s, g);
    expect(s.buildings.length).toBeGreaterThan(0);
    for (const b of s.buildings) {
      b.state = 'active';
      b.jobs = 200;
    }
    updateDemand(s);
    expect(s.stats.demand.C).toBe(0);
    const count = s.buildings.length;
    tick(s, g, 5);
    expect(s.buildings).toHaveLength(count);
    s.buildings = [];
    s.zoneBlocks[0]!.buildingAt.fill(-1);
    updateDemand(s);
    expect(s.stats.demand.C).toBe(20);
    tick(s, g);
    expect(s.buildings.length).toBeGreaterThan(0);
  });
  it.each(Object.keys(ZONES) as ZoneType[])(
    'grows only legal %s sizes and never overlaps',
    (zone) => {
      const s = fixture(zone),
        g = new GrowthSystem();
      tick(s, g, 40);
      expect(s.buildings.length).toBeGreaterThan(0);
      const polygons = s.buildings.map(zoneBuildingFootprint);
      for (const [i, b] of s.buildings.entries()) {
        expect(b.lotW).toBeGreaterThanOrEqual(ZONES[zone].lotWidthCells[0]);
        expect(b.lotW).toBeLessThanOrEqual(ZONES[zone].lotWidthCells[1]);
        expect(b.lotD).toBeGreaterThanOrEqual(ZONES[zone].lotDepthCells[0]);
        expect(b.lotD).toBeLessThanOrEqual(ZONES[zone].lotDepthCells[1]);
        expect(b.pos.z).toBe(8);
        expect(b.blockCell).toBeLessThan(s.zoneBlocks[0]!.width);
        expect(
          [...s.zoneBlocks[0]!.buildingAt].filter((id) => id === b.id),
        ).toHaveLength(b.lotW * b.lotD);
        for (let j = 0; j < i; j++)
          expect(zonePolygonsOverlap(polygons[i]!, polygons[j]!)).toBe(false);
      }
    },
  );
  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI])(
    'matches cells and rendered depth on both sides at angle %s',
    (angle) => {
      for (const side of [1, -1] as const) {
        const s = fixture(),
          block = s.zoneBlocks[0]!;
        block.side = side;
        block.origin = { x: 0, z: 0 };
        block.dir = { x: Math.cos(angle), z: Math.sin(angle) };
        const p = lotPlacement(block, 2, 2),
          shape = { ...p, lotW: 2, lotD: 2 };
        const matrix = new Matrix4()
          .makeRotationY(p.rotation + Math.PI)
          .setPosition(p.pos.x, 0, p.pos.z);
        const center = new Vector3(0, 0, -8).applyMatrix4(matrix);
        // Model depth -Z is transformed into the world's +Z footprint and the road's inward normal.
        expect(center.x).toBeCloseTo(p.pos.x - block.dir.z * side * 8);
        expect(center.z).toBeCloseTo(p.pos.z + block.dir.x * side * 8);
        const footprint = zoneBuildingFootprint(shape);
        for (const index of [2, 3, 40, 41])
          expect(
            zonePolygonsOverlap(footprint, zoneCellPolygon(block, index)),
          ).toBe(true);
        expect(zonePolygonsOverlap(footprint, zoneCellPolygon(block, 4))).toBe(
          false,
        );
      }
    },
  );
  it('rejects back-row-only, mixed, occupied, unowned, locked and incompatible frontage', () => {
    const s = fixture('I'),
      b = s.zoneBlocks[0]!;
    b.cells.fill(0, 0, b.width);
    expect(finder(s).find('I', new Rng(1))).toBeNull();
    b.cells.fill(5);
    b.buildingAt.fill(200);
    expect(finder(s).find('I', new Rng(1))).toBeNull();
    b.buildingAt.fill(-1);
    s.ownedTiles = [];
    expect(finder(s).find('I', new Rng(1))).toBeNull();
    s.ownedTiles = [12];
    s.segments[0]!.type = 'gravel';
    expect(finder(s).find('I', new Rng(1))).toBeNull();
    s.segments[0]!.type = 'road_small';
    s.segments[0]!.elevated = true;
    expect(finder(s).find('I', new Rng(1))).toBeNull();
    const h = fixture('RH');
    h.settings.mode = 'normal';
    h.unlocked = [0];
    expect(finder(h).find('RH', new Rng(1))).toBeNull();
    const m = fixture('I');
    m.zoneBlocks[0]!.cells.forEach(
      (_, i) => (m.zoneBlocks[0]!.cells[i] = i % 2 ? 1 : 5),
    );
    expect(finder(m).find('I', new Rng(1))).toBeNull();
  });
  it('checks the whole footprint for water and a strictly sub-15% slope', () => {
    const s = fixture(),
      p = zoneBuildingFootprint({
        pos: { x: 0, z: 0 },
        rotation: 0,
        lotW: 2,
        lotD: 2,
      });
    for (const slope of [0.149, 0.151]) {
      for (let z = 0; z < WORLD.heightmapVertices; z++)
        for (let x = 0; x < WORLD.heightmapVertices; x++)
          s.terrain.heights[z * WORLD.heightmapVertices + x] =
            100 + (x * 16 - MAP_SIZE / 2) * slope;
      expect(zoneTerrainValid(p, s.terrain.heights, 0.15, true)).toBe(
        slope < 0.15,
      );
    }
    // An exactly representable threshold isolates exclusive comparison from Float32 rounding.
    for (let i = 0; i < s.terrain.heights.length; i++)
      s.terrain.heights[i] = 100 + ((i % 301) * 16 - 2400) * 0.125;
    expect(zoneTerrainValid(p, s.terrain.heights, 0.125, true)).toBe(false);
    s.terrain.heights.fill(60);
    s.terrain.heights[151 * 301 + 150] = 39;
    expect(zoneTerrainValid(p, s.terrain.heights, 100, true)).toBe(false);
  });
});
describe('deterministic construction and rezoning', () => {
  it('shares a demand budget, caps attempts, and has no zero-demand growth', () => {
    const s = fixture(),
      g = new GrowthSystem();
    s.stats.demand.R = 19;
    tick(s, g);
    expect(s.buildings).toHaveLength(0);
    s.stats.demand.R = 20;
    tick(s, g);
    expect(s.buildings).toHaveLength(1);
    s.stats.demand.R = 999;
    const n = s.buildings.length;
    tick(s, g);
    expect(s.buildings.length - n).toBeLessThanOrEqual(5);
    const mixed = fixture();
    mixed.zoneBlocks.push({
      ...mixed.zoneBlocks[0]!,
      id: 5,
      origin: { x: -152, z: -8 },
      side: -1,
      cells: new Uint8Array(152).fill(2),
      buildingAt: new Int32Array(152).fill(-1),
    });
    tick(mixed, new GrowthSystem());
    expect(mixed.buildings).toHaveLength(5);
  });
  it('finishes exactly 30 ticks after starting and replays identically', () => {
    const s = fixture(),
      g = new GrowthSystem();
    tick(s, g);
    const b = s.buildings[0]!;
    s.stats.demand.R = 0;
    tick(s, g, 29);
    expect(b.state).toBe('construction');
    expect(b.stateTimer).toBe(2.9);
    tick(s, g);
    expect(b.state).toBe('active');
    expect(b.stateTimer).toBe(0);
    const a = fixture(),
      c = fixture();
    tick(a, new GrowthSystem(), 50);
    const cg = new GrowthSystem();
    tick(c, cg, 20);
    tick(c, cg, 30);
    expect(c.buildings).toEqual(a.buildings);
    expect(c.zoneBlocks).toEqual(a.zoneBlocks);
    expect(a.stats.population).toBe(0);
    expect(a.buildings.every((b) => b.households === 0 && b.jobs === 0)).toBe(
      true,
    );
  });
  it('removes a rezoned building at three days, frees every cell, charges nothing and regrows', () => {
    const s = fixture(),
      g = new GrowthSystem();
    s.stats.demand.R = 20;
    tick(s, g);
    const b = s.buildings[0]!,
      block = s.zoneBlocks[0]!,
      money = s.money;
    const cells = [...block.buildingAt].flatMap((id, i) =>
      id === b.id ? [i] : [],
    );
    s.stats.demand.R = 0;
    for (const i of cells) block.cells[i] = 3;
    expect(g.zoningChanged(s)).toHaveLength(1);
    expect(b.rezoneAtTick).toBe(31);
    tick(s, g, 10);
    g.zoningChanged(s);
    expect(b.rezoneAtTick).toBe(31);
    tick(s, g, 19);
    expect(s.buildings).toContain(b);
    tick(s, g);
    expect(s.buildings).not.toContain(b);
    expect(cells.every((i) => block.buildingAt[i] === -1)).toBe(true);
    expect(s.money).toBe(money);
    // Explicit zoning revision invalidates cached candidates, as Simulation.zone does.
    s.zoneBlocks = [block];
    s.stats.demand.C = 20;
    tick(s, g, 10);
    expect(s.buildings.some((b) => b.defId === 'CL')).toBe(true);
  });
  it('cancels demolition only when every occupied cell matches again', () => {
    const s = fixture(),
      g = new GrowthSystem();
    tick(s, g);
    const b = s.buildings[0]!,
      block = s.zoneBlocks[0]!,
      i = block.buildingAt.indexOf(b.id);
    block.cells[i] = 0;
    g.zoningChanged(s);
    expect(b.rezoneAtTick).toBeDefined();
    block.cells[i] = 1;
    expect(g.zoningChanged(s)[0]).toMatchObject({
      id: b.id,
      rezoneAtTick: undefined,
    });
    s.zoneBlocks = [];
    expect(g.zoningChanged(s)).toEqual([]);
    expect(b.rezoneAtTick).toBeUndefined();
  });
  it('ignores progress-only patches for tool geometry and recognizes added/removed/moved buildings', () => {
    expect(
      buildingsChangeFootprints({
        t: 'buildingsChanged',
        added: [],
        removed: [],
        updated: [{ id: 1, state: 'active', stateTimer: 0 }],
      }),
    ).toBe(false);
    expect(
      buildingsChangeFootprints({
        t: 'buildingsChanged',
        added: [],
        removed: [1],
        updated: [],
      }),
    ).toBe(true);
    expect(
      buildingsChangeFootprints({
        t: 'buildingsChanged',
        added: [],
        removed: [],
        updated: [{ id: 1, pos: { x: 0, z: 0 } }],
      }),
    ).toBe(true);
  });
  it('uses real road/zoning commands, mirrors IDs, pauses and keeps references after road splitting', () => {
    const mirror = new WorldMirror(),
      sim = new Simulation(
        { seed: 42, mapId: 'valley', mode: 'normal', cityName: 'Live' },
        (e) => mirror.apply(e),
      );
    const off = sim.onDay((s) => s.terrain.heights.fill(60));
    sim.setSpeed(1);
    for (let i = 0; i < 10; i++) sim.tick();
    off();
    sim.setSpeed(0);
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    expect(sim.snapshot().stats.demand).toEqual(INITIAL_DEMAND);
    expect(
      sim.buildRoad('road_small', {
        start: { x: -240, z: 0 },
        c1: { x: -240 + 320 / 3, z: 0 },
        c2: { x: 80 - 320 / 3, z: 0 },
        end: { x: 80, z: 0 },
        elevated: false,
      }).ok,
    ).toBe(true);
    const block = sim.snapshot().zoneBlocks[0]!;
    const cells = [...block.cells].flatMap((v, i) =>
      v === 0 ? [[block.id, i] as [number, number]] : [],
    );
    expect(sim.zone(cells, 'RL').ok).toBe(true);
    sim.tick();
    expect(sim.snapshot().buildings).toHaveLength(0);
    sim.setSpeed(1);
    sim.tick();
    expect(sim.snapshot().buildings.length).toBeGreaterThan(0);
    const snapshot = sim.snapshot();
    expect(mirror.readBuildings()).toEqual(snapshot.buildings);
    expect(mirror.readRoadWorld()!.nextId).toBe(snapshot.nextId);
    sim.setSpeed(0);
    for (let i = 0; i < 50; i++) sim.tick();
    expect(sim.snapshot().buildings).toEqual(snapshot.buildings);
    // Connect from the unzoned side to avoid occupied frontage collision.
    const side = block.side;
    expect(
      sim.buildRoad('road_small', {
        start: { x: 0, z: -side * 160 },
        c1: { x: 0, z: (-side * 320) / 3 },
        c2: { x: 0, z: (-side * 160) / 3 },
        end: { x: 0, z: 0 },
        elevated: false,
      }).ok,
    ).toBe(true);
    const after = sim.snapshot();
    for (const b of after.buildings) {
      const grid = after.zoneBlocks.find((z) => z.id === b.zoneBlock);
      expect(grid?.buildingAt[b.blockCell!]).toBe(b.id);
    }
    expect(mirror.readBuildings()).toEqual(after.buildings);
  });
});
