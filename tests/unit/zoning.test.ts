import { describe, expect, it } from 'vitest';
import { ZONES, ZONE_CODES } from '../../src/data/zones';
import { ZONE_TOOL } from '../../src/data/zoneTool';
import {
  paintZones,
  isZonePayload,
  zoneCellOwned,
  type ZoningWorld,
} from '../../src/world/zoning';
import { ZoneSelection } from '../../src/world/zoneSelection';
import { zoneCellCenter } from '../../src/world/zoneGrid';
import type { ZoneBlock, ZoneType } from '../../src/world/types';
import { CommandDispatcher } from '../../src/sim/commands';
import { Simulation } from '../../src/sim/simulation';
import type { SimEvent } from '../../src/bridge/protocol';
import { WorldMirror } from '../../src/bridge/mirror';
import { MAP_PRESETS } from '../../src/data/terrain';

function fixture(): ZoningWorld {
  const block: ZoneBlock = {
    id: 4,
    segment: 3,
    side: 1,
    origin: { x: 4, z: 8 },
    dir: { x: 1, z: 0 },
    width: 8,
    cells: new Uint8Array(32),
    buildingAt: new Int32Array(32).fill(-1),
  };
  return {
    zoneBlocks: [block],
    segments: [
      {
        id: 3,
        type: 'road_small',
        start: 1,
        end: 2,
        c1: { x: 20, z: 0 },
        c2: { x: 40, z: 0 },
        length: 64,
        elevated: false,
        builtDay: 0,
        zoneBlockIds: [4],
      },
    ],
    ownedTiles: [12],
    unlocked: [0, 1, 2, 3, 4],
    mode: 'normal',
  };
}
describe('atomic authoritative zoning', () => {
  it.each(Object.keys(ZONES) as ZoneType[])(
    'paints and clears %s without changing source buffers',
    (zone) => {
      const w = fixture();
      const result = paintZones(
        w,
        [
          [4, 0],
          [4, 1],
          [4, 0],
        ],
        zone,
      );
      expect(result.reason).toBeNull();
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]!.cells[0]).toBe(ZONE_CODES[zone]);
      expect(w.zoneBlocks[0]!.cells[0]).toBe(0);
      const cleared = paintZones(
        { ...w, zoneBlocks: result.blocks },
        [[4, 0]],
        null,
      );
      expect(cleared.blocks[0]!.cells[0]).toBe(0);
      expect(cleared.blocks[0]!.cells[1]).toBe(ZONE_CODES[zone]);
    },
  );
  it('rejects the whole batch if any cell is stale, invalid, or outside', () => {
    const w = fixture();
    w.zoneBlocks[0]!.cells[2] = 255;
    w.zoneBlocks[0]!.buildingAt[3] = 100;
    for (const cell of [
      [4, 2],
      [8, 0],
      [4, 32],
    ] as [number, number][]) {
      const r = paintZones(w, [[4, 0], cell], 'RL');
      expect(r.reason).not.toBeNull();
      expect(r.blocks).toEqual([]);
      expect(w.zoneBlocks[0]!.cells[0]).toBe(0);
    }
    expect(paintZones({ ...w, ownedTiles: [] }, [[4, 0]], 'RL').reason).toBe(
      'err.zoneLand',
    );
  });
  it('rechecks milestone, gravel and elevated road constraints, including direct calls', () => {
    const w = fixture();
    expect(paintZones({ ...w, unlocked: [0] }, [[4, 0]], 'RH').reason).toBe(
      'err.zoneLocked',
    );
    expect(
      paintZones({ ...w, unlocked: [], mode: 'sandbox' }, [[4, 0]], 'O').reason,
    ).toBeNull();
    w.segments[0]!.type = 'gravel';
    expect(paintZones(w, [[4, 0]], 'CL').reason).toBeNull();
    expect(paintZones(w, [[4, 0]], 'I').reason).toBe('err.zoneRoad');
    w.segments[0]!.elevated = true;
    expect(paintZones(w, [[4, 0]], 'RL').reason).toBe('err.zoneRoad');
    expect(paintZones(w, [[4, -1]], 'RL').reason).toBe('err.invalidCommand');
  });
  it('checks the entire rotated footprint at owned boundaries, permitting exact edge contact', () => {
    const b = fixture().zoneBlocks[0]!;
    b.origin = { x: 476, z: 0 };
    expect(zoneCellOwned(b, 0, [12])).toBe(true);
    b.origin.x = 477;
    expect(zoneCellOwned(b, 0, [12])).toBe(false);
    b.dir = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
    b.origin = { x: 479, z: 0 };
    expect(zoneCellOwned(b, 0, [12])).toBe(false);
    expect(zoneCellOwned(b, 0, [12, 13])).toBe(true);
  });
  it.each([
    null,
    [],
    [[4, -1]],
    [[4, Infinity]],
    [[4, 0, 1]],
    [[0, 0]],
    [[4, 0.5]],
    Array(ZONE_TOOL.maxCellsPerCommand + 1).fill([4, 0]),
  ])('rejects malformed / unbounded payload %#', (cells) => {
    expect(isZonePayload(cells, 'RL')).toBe(false);
  });
  it('rejects unknown zone names and undefined erase, and sends no event for an idempotent paint', () => {
    expect(isZonePayload([[4, 0]], 'constructor')).toBe(false);
    expect(isZonePayload([[4, 0]], undefined)).toBe(false);
    const w = fixture();
    w.zoneBlocks[0]!.cells[0] = 1;
    expect(paintZones(w, [[4, 0]], 'RL').blocks).toEqual([]);
  });
});
describe('roadside selection algorithms', () => {
  it('fills only contiguous empty cells; erase floods only the same color, not another block', () => {
    const w = fixture(),
      b = w.zoneBlocks[0]!;
    for (const i of [3, 11, 19, 27]) b.cells[i] = 255;
    const selection = new ZoneSelection(w);
    expect(selection.fill(zoneCellCenter(b, 0), 'RL')).toHaveLength(12);
    expect(selection.fill(zoneCellCenter(b, 7), 'RL')).toHaveLength(16);
    b.cells[0] = b.cells[1] = 1;
    b.cells[2] = 3;
    expect(selection.fill(zoneCellCenter(b, 0), 'CL')).toEqual([]);
    expect(selection.fill(zoneCellCenter(b, 0), null)).toEqual([
      [4, 0],
      [4, 1],
    ]);
  });
  it('rectangle includes centers and a fast brush sweep has no gaps', () => {
    const w = fixture(),
      s = new ZoneSelection(w);
    expect(s.rectangle({ x: 0, z: 8 }, { x: 16, z: 24 }, 'I')).toEqual([
      [4, 0],
      [4, 1],
      [4, 8],
      [4, 9],
    ]);
    const stroke = s.brush({ x: 4, z: 12 }, { x: 60, z: 12 }, 8, 'CL');
    for (let i = 0; i < 8; i++) expect(stroke).toContainEqual([4, i]);
    expect(
      s.brush({ x: 28, z: 20 }, { x: 28, z: 20 }, 24, 'CL').length,
    ).toBeGreaterThan(
      s.brush({ x: 28, z: 20 }, { x: 28, z: 20 }, 8, 'CL').length,
    );
  });
  it('handles rotated grids, allows occupied cells but excludes unowned land / incompatible roads', () => {
    const w = fixture(),
      b = w.zoneBlocks[0]!;
    b.dir = { x: 0, z: 1 };
    b.buildingAt[0] = 100;
    const s = new ZoneSelection(w);
    expect(s.hit(zoneCellCenter(b, 2))!.ref).toEqual([4, 2]);
    expect(s.brush({ x: 0, z: 0 }, { x: 0, z: 64 }, 100, 'RL')).toContainEqual([
      4, 0,
    ]);
    expect(
      new ZoneSelection({ ...w, ownedTiles: [] }).fill(
        zoneCellCenter(b, 2),
        'RL',
      ),
    ).toEqual([]);
    w.segments[0]!.type = 'gravel';
    expect(new ZoneSelection(w).fill(zoneCellCenter(b, 2), 'I')).toEqual([]);
  });
});
describe('worker / mirror zoning integration', () => {
  it('paints while paused, emits changed blocks, mirrors acknowledged state and preserves money', () => {
    const events: SimEvent[] = [],
      mirror = new WorldMirror();
    const sim = new Simulation(
      {
        seed: MAP_PRESETS[0].seed,
        mapId: 'valley',
        mode: 'normal',
        cityName: 'Zoning',
      },
      (e) => {
        events.push(e);
        mirror.apply(e);
      },
    );
    const f = fixture();
    const unsub = sim.onDay((s) => {
      s.zoneBlocks = [...f.zoneBlocks];
      s.segments = [...f.segments];
    });
    sim.setSpeed(1);
    for (let i = 0; i < 10; i++) sim.tick();
    unsub();
    sim.setSpeed(0);
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    const money = sim.snapshot().money;
    expect(
      sim.zone(
        [
          [4, 0],
          [4, 1],
        ],
        'CL',
      ),
    ).toEqual({ ok: true, cost: 0 });
    expect(mirror.readZoneBlocks()[0]!.cells[1]).toBe(3);
    expect(sim.snapshot().money).toBe(money);
    expect(
      sim.zone(
        [
          [4, 0],
          [4, 1000],
        ],
        null,
      ).ok,
    ).toBe(false);
    expect(sim.snapshot().zoneBlocks[0]!.cells[0]).toBe(3);
    const zones = events.filter((e) => e.t === 'zonesChanged');
    expect(zones).toHaveLength(1);
    zones[0]!.blocks[0]!.cells[0] = 6;
    expect(sim.snapshot().zoneBlocks[0]!.cells[0]).toBe(3);
  });
  it('worker rejects unsupported shapes, invalid zones, stale IDs and pre-init commands', () => {
    const events: SimEvent[] = [],
      dispatcher = new CommandDispatcher((e) => events.push(e));
    dispatcher.handle({ t: 'zone', reqId: 1, cells: [[4, 0]], zone: 'RL' });
    expect(events.at(-1)).toMatchObject({ ok: false, reason: 'err.notReady' });
    dispatcher.handle({
      t: 'init',
      reqId: 2,
      seed: 1,
      mapId: 'valley',
      cityName: 'Test',
      mode: 'normal',
    });
    for (const value of [
      { cells: [], zone: 'RL' },
      { cells: [[4, 0]], zone: 'BAD' },
      { cells: [[4, -1]], zone: null },
    ]) {
      dispatcher.handle({ t: 'zone', reqId: 3, ...value });
      expect(events.at(-1)).toMatchObject({
        ok: false,
        reason: 'err.invalidCommand',
      });
    }
    dispatcher.handle({ t: 'zone', reqId: 4, cells: [[4, 0]], zone: 'RL' });
    expect(events.at(-1)).toMatchObject({ ok: false, reason: 'err.zoneCell' });
  });
});
