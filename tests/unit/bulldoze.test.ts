import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import { WorldMirror } from '../../src/bridge/mirror';
import type { SimEvent } from '../../src/bridge/protocol';
import type { SimState } from '../../src/sim/state';
import {
  demolitionRefund,
  planBulldoze,
  quoteBulldoze,
  isBulldozeTargets,
  type BulldozeWorld,
} from '../../src/world/bulldoze';
import { BulldozeSelection } from '../../src/world/bulldozeSelection';
import { roadAccess } from '../../src/world/roadAccess';
import { RoadGraph } from '../../src/world/roadGraph';
import { PROBLEMS } from '../../src/data/simulation';
import { BULLDOZE } from '../../src/data/bulldoze';
import { WORLD } from '../../src/data/config';
import type { Building, ZoneBlock } from '../../src/world/types';
import type { RoadDraft } from '../../src/world/snapshot';

const draft = (ax: number, az: number, bx: number, bz: number): RoadDraft => ({
  start: { x: ax, z: az },
  end: { x: bx, z: bz },
  c1: { x: ax + (bx - ax) / 3, z: az + (bz - az) / 3 },
  c2: { x: ax + ((bx - ax) * 2) / 3, z: az + ((bz - az) * 2) / 3 },
  elevated: false,
});
const road = (
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cost = 400,
  day = 0,
) => ({
  start: { x: ax, z: az },
  end: { x: bx, z: bz },
  type: 'road_small' as const,
  builtDay: day,
  paidCost: cost,
  startHeight: 60,
  endHeight: 60,
});
function building(): Building {
  return {
    id: 500,
    kind: 'zoned',
    defId: 'RL',
    level: 1,
    pos: { x: 40, z: 8 },
    rotation: 0,
    lotW: 1,
    lotD: 1,
    seed: 1,
    state: 'active',
    stateTimer: 0,
    flags: 0,
    problemTimers: Object.fromEntries(
      Object.keys(PROBLEMS).map((k) => [k, 0]),
    ) as Building['problemTimers'],
    households: 1,
    residents: 3,
    jobs: 0,
    workers: 0,
  };
}
function world(): BulldozeWorld {
  const g = new RoadGraph();
  g.addRoad(road(0, 0, 160, 0));
  return {
    ...g.snapshot(),
    heights: new Float32Array(WORLD.heightmapVertices ** 2).fill(60),
    zoneBlocks: [],
    buildings: [],
    networks: { power: [], water: [] },
    day: 0,
    mode: 'normal',
  };
}
function setup(mode: 'normal' | 'sandbox' = 'normal') {
  const events: SimEvent[] = [],
    mirror = new WorldMirror();
  const sim = new Simulation(
    { seed: 1, mapId: 'valley', cityName: 'Demolition', mode },
    (e) => {
      events.push(e);
      mirror.apply(e);
    },
  );
  let state!: SimState;
  const off = sim.onDay((s) => {
    state = s;
    s.terrain.heights.fill(60);
  });
  sim.setSpeed(1);
  for (let i = 0; i < 10; i++) sim.tick();
  off();
  sim.setSpeed(0);
  mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
  return { sim, state, events, mirror };
}
describe('refund accounting', () => {
  it.each([
    [0, 400],
    [6, 400],
    [7, 0],
    [8, 0],
    [-1, 0],
  ])('age %i refunds %i', (age, expected) =>
    expect(
      demolitionRefund({ builtDay: 10, paidCost: 400 }, 10 + age, 'normal'),
    ).toBe(expected),
  );
  it('does not invent payments for missing metadata, sandbox, or invalid paid cost', () => {
    expect(demolitionRefund({ builtDay: 0 }, 0, 'normal')).toBe(0);
    expect(demolitionRefund({ paidCost: 400 }, 0, 'normal')).toBe(0);
    expect(demolitionRefund({ builtDay: 0, paidCost: 400 }, 0, 'sandbox')).toBe(
      0,
    );
    expect(demolitionRefund({ builtDay: 0, paidCost: -4 }, 0, 'normal')).toBe(
      0,
    );
  });
  it('conserves exact integer payments over repeated off-grid splits without resetting age', () => {
    const g = new RoadGraph();
    g.addRoad(road(-160, 0, 160, 0, 801, 2));
    for (const x of [-113, -51, 13, 79]) g.addRoad(road(x, -80, x, 80, 401, 5));
    const segments = g.snapshot().segments;
    expect(
      segments
        .filter((s) => s.builtDay === 2)
        .reduce((a, s) => a + s.paidCost!, 0),
    ).toBe(801);
    expect(segments.reduce((a, s) => a + s.paidCost!, 0)).toBe(801 + 4 * 401);
    expect(
      segments.reduce((a, s) => a + demolitionRefund(s, 9, 'normal'), 0),
    ).toBe(4 * 401);
  });
  it('refunds precisely what a diagonal / split simulation road cost, once', () => {
    const { sim, state } = setup();
    expect(sim.buildRoad('road_small', draft(-160, 0, 160, 0)).ok).toBe(true);
    expect(sim.buildRoad('road_small', draft(13, -160, 13, 160)).ok).toBe(true);
    expect(sim.buildRoad('road_small', draft(-140, -140, -40, -40)).ok).toBe(
      true,
    );
    const spent = 70000 - state.money;
    const targets = state.segments.map((s) => ({
      kind: 'segment' as const,
      id: s.id,
    }));
    expect(sim.bulldoze(targets)).toEqual({ ok: true, refund: spent, cost: 0 });
    expect(state.money).toBe(70000);
    expect(sim.bulldoze(targets).ok).toBe(false);
    expect(state.money).toBe(70000);
  });
});
describe('atomic demolition and topology', () => {
  it('removes one crossing arm, maintains reciprocal adjacency, then removes the remaining junction', () => {
    const g = new RoadGraph();
    g.addRoad(road(-160, 0, 160, 0, 800));
    g.addRoad(road(0, -160, 0, 160, 800));
    const w = { ...world(), ...g.snapshot() };
    const removed = w.segments[0]!;
    const r = planBulldoze(w, [{ kind: 'segment', id: removed.id }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.zones.segments).toHaveLength(3);
    expect(r.nodes.filter((n) => n.segments.length === 3)).toHaveLength(1);
    for (const s of r.zones.segments)
      for (const id of [s.start, s.end])
        expect(r.nodes.find((n) => n.id === id)!.segments).toContain(s.id);
    const after = planBulldoze(
      {
        ...w,
        nodes: r.nodes,
        segments: r.zones.segments,
        zoneBlocks: r.zones.blocks,
        nextId: r.zones.nextId,
      },
      r.zones.segments.map((s) => ({ kind: 'segment', id: s.id })),
    );
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.nodes).toEqual([]);
      expect(after.zones.blocks).toEqual([]);
    }
    expect(w.segments).toHaveLength(4);
  });
  it('removes an arm at a T junction without merging roads of different age or losing their refunds', () => {
    const g = new RoadGraph();
    g.addRoad(road(-160, 0, 160, 0, 800, 0));
    g.addRoad(road(0, 0, 0, 80, 200, 5));
    const w = { ...world(), ...g.snapshot(), day: 6 };
    const branch = w.segments.find((s) => s.builtDay === 5)!;
    const result = planBulldoze(w, [{ kind: 'segment', id: branch.id }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refund).toBe(200);
      expect(result.zones.segments).toHaveLength(2);
      expect(result.zones.segments.reduce((a, s) => a + s.paidCost!, 0)).toBe(
        800,
      );
      expect(result.nodes.find((n) => n.segments.length === 2)!.control).toBe(
        'none',
      );
    }
  });
  it('rejects a mixed stale batch without changing world or money; duplicates refund only once', () => {
    const w = world(),
      id = w.segments[0]!.id;
    expect(
      planBulldoze(w, [
        { kind: 'segment', id },
        { kind: 'building', id: 999 },
      ]),
    ).toMatchObject({ ok: false, reason: 'err.bulldozeMissing' });
    expect(w.segments).toHaveLength(1);
    expect(
      quoteBulldoze(w, [
        { kind: 'segment', id },
        { kind: 'segment', id },
      ]).refund,
    ).toBe(400);
  });
  it('worker removal synchronizes mirror, zone blocks, money and nextId while paused', () => {
    const { sim, state, mirror } = setup();
    sim.buildRoad('road_small', draft(-160, 0, 160, 0));
    const id = state.segments[0]!.id,
      nextId = state.nextId;
    expect(state.zoneBlocks.length).toBeGreaterThan(0);
    expect(sim.bulldoze([{ kind: 'segment', id }]).ok).toBe(true);
    expect(mirror.readRoadWorld()!.segments).toEqual([]);
    expect(mirror.readZoneBlocks()).toEqual([]);
    expect(mirror.readRoadWorld()!.money).toBe(70000);
    expect(state.nextId).toBeGreaterThanOrEqual(nextId);
    sim.buildRoad('road_small', draft(-160, 0, 160, 0));
    expect(state.segments[0]!.id).toBeGreaterThan(id);
  });
  it('handles future service buildings and networks, clears occupancy, and preserves other kinds', () => {
    const w = world(),
      b = {
        ...building(),
        kind: 'service' as const,
        defId: 'police_small',
        builtDay: 0,
        paidCost: 1000,
      };
    w.buildings = [b];
    w.networks = {
      power: [
        {
          id: 600,
          points: [
            { x: 0, z: 50 },
            { x: 50, z: 50 },
          ],
          builtDay: 0,
          paidCost: 100,
        },
      ],
      water: [
        {
          id: 601,
          points: [
            { x: 0, z: 55 },
            { x: 50, z: 55 },
          ],
          builtDay: 0,
          paidCost: 80,
        },
      ],
    };
    const r = planBulldoze(w, [
      { kind: 'building', id: 500 },
      { kind: 'network', id: 600 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.refund).toBe(1100);
      expect(r.buildings).toEqual([]);
      expect(r.networks.power).toEqual([]);
      expect(r.networks.water).toHaveLength(1);
      expect(r.removedNetworks).toEqual({ power: [600], water: [] });
    }
  });
  it('deleting a zoned building frees its cells without clearing zoning or paying a refund', () => {
    const w = world(),
      b = building();
    b.paidCost = 999;
    b.builtDay = 0;
    w.buildings = [b];
    const zone: ZoneBlock = {
      id: 10,
      segment: w.segments[0]!.id,
      side: 1,
      origin: { x: 4, z: 8 },
      dir: { x: 1, z: 0 },
      width: 20,
      cells: new Uint8Array(80).fill(1),
      buildingAt: new Int32Array(80).fill(-1),
    };
    zone.buildingAt[4] = 500;
    w.zoneBlocks = [zone];
    const r = planBulldoze(w, [{ kind: 'building', id: 500 }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.refund).toBe(0);
      expect(r.zones.blocks.some((z) => z.buildingAt.includes(500))).toBe(
        false,
      );
      expect(r.zones.blocks.some((z) => z.cells.includes(1))).toBe(true);
    }
  });
  it('removing occupied housing updates population once and leaves other households intact', () => {
    const { sim, state, mirror } = setup();
    state.buildings = [building(), { ...building(), id: 501 }];
    state.stats.population = 6;
    mirror.apply({ t: 'ready', reqId: 2, snapshot: sim.snapshot() });
    expect(
      sim.bulldoze([
        { kind: 'building', id: 500 },
        { kind: 'building', id: 500 },
      ]).ok,
    ).toBe(true);
    expect(state.stats.population).toBe(3);
    expect(mirror.readSnapshot()!.stats.population).toBe(3);
    expect(state.buildings.map((b) => b.id)).toEqual([501]);
    expect(sim.bulldoze([{ kind: 'building', id: 500 }]).ok).toBe(false);
    expect(state.stats.population).toBe(3);
  });
  it.each(['abandoned', 'burned'] as const)(
    'charges cleanup for %s buildings, including an already negative treasury',
    (stateName) => {
      const { sim, state } = setup();
      state.money = -10;
      state.buildings = [
        {
          ...building(),
          state: stateName,
          lotW: 2,
          lotD: 3,
          builtDay: 1,
          paidCost: 1000,
        },
      ];
      expect(sim.bulldoze([{ kind: 'building', id: 500 }])).toEqual({
        ok: true,
        refund: 0,
        cost: 600,
      });
      expect(state.money).toBe(-610);
    },
  );
  it('sandbox demolition cannot generate money or charge cleanup', () => {
    const { sim, state } = setup('sandbox');
    sim.buildRoad('road_small', draft(-160, 0, 160, 0));
    state.buildings = [{ ...building(), state: 'burned' }];
    expect(
      sim.bulldoze([
        { kind: 'segment', id: state.segments[0]!.id },
        { kind: 'building', id: 500 },
      ]),
    ).toEqual({ ok: true, refund: 0, cost: 0 });
    expect(state.money).toBe(70000);
  });
  it.each([
    null,
    [],
    [{ kind: 'node', id: 1 }],
    [{ kind: 'segment', id: -1 }],
    [{ kind: 'segment', id: 1.1 }],
    Array(BULLDOZE.maxTargets + 1).fill({ kind: 'segment', id: 1 }),
  ])('rejects malformed and oversized batch %#', (value) =>
    expect(isBulldozeTargets(value)).toBe(false),
  );
  it('dispatcher accepts legacy single targets but rejects ambiguous envelopes and stale IDs', () => {
    const events: SimEvent[] = [],
      d = new CommandDispatcher((e) => events.push(e));
    d.handle({ t: 'bulldoze', reqId: 1, target: { kind: 'segment', id: 1 } });
    expect(events.at(-1)).toMatchObject({ ok: false, reason: 'err.notReady' });
    d.handle({
      t: 'init',
      reqId: 2,
      seed: 1,
      mapId: 'valley',
      mode: 'normal',
      cityName: 'Test',
    });
    d.handle({ t: 'bulldoze', reqId: 3, target: { kind: 'segment', id: 1 } });
    expect(events.at(-1)).toMatchObject({
      ok: false,
      reason: 'err.bulldozeMissing',
    });
    d.handle({
      t: 'bulldoze',
      reqId: 4,
      target: { kind: 'segment', id: 1 },
      targets: [{ kind: 'segment', id: 1 }],
    });
    expect(events.at(-1)).toMatchObject({
      ok: false,
      reason: 'err.invalidCommand',
    });
  });
});
describe('frontage and abandonment', () => {
  it('marks access loss immediately, retains the building, and abandons after thirty full days', () => {
    const { sim, state } = setup();
    sim.buildRoad('road_small', draft(0, 0, 160, 0));
    state.buildings = [building()];
    expect(roadAccess(state.nodes, state.segments)(state.buildings[0]!)).toBe(
      true,
    );
    sim.bulldoze([{ kind: 'segment', id: state.segments[0]!.id }]);
    expect(state.buildings[0]!.roadDisconnectedDay).toBe(1);
    expect(state.buildings[0]!.state).toBe('active');
    sim.setSpeed(1);
    for (let i = 0; i < 290; i++) sim.tick();
    expect(state.buildings[0]!.state).toBe('active');
    for (let i = 0; i < 10; i++) sim.tick();
    expect(state.buildings[0]).toMatchObject({
      state: 'abandoned',
      residents: 0,
      problemTimers: { noRoad: 30 },
    });
  });
  it('clears removed zone anchors in both authority and mirror without deleting the building', () => {
    const { sim, state, mirror } = setup();
    sim.buildRoad('road_small', draft(0, 0, 160, 0));
    const block = state.zoneBlocks.find((b) => b.side === 1)!;
    const b = {
      ...building(),
      pos: { x: 36, z: 8 },
      zoneBlock: block.id,
      blockCell: 4,
    };
    state.buildings = [b];
    state.stats.population = 3;
    block.buildingAt[4] = b.id;
    mirror.apply({ t: 'ready', reqId: 2, snapshot: sim.snapshot() });
    sim.bulldoze([{ kind: 'segment', id: state.segments[0]!.id }]);
    expect(state.buildings[0]).toMatchObject({
      id: 500,
      roadDisconnectedDay: 1,
    });
    expect(state.buildings[0]!.zoneBlock).toBeUndefined();
    expect(mirror.readSnapshot()!.buildings[0]!.zoneBlock).toBeUndefined();
    sim.setSpeed(1);
    for (let n = 0; n < 300; n++) sim.tick();
    expect(state.stats.population).toBe(0);
    expect(mirror.readSnapshot()!.buildings[0]!.state).toBe('abandoned');
  });
  it('reconnecting frontage cancels the abandonment timer without treating rear roads as access', () => {
    const { sim, state } = setup();
    sim.buildRoad('road_small', draft(0, 0, 160, 0));
    state.buildings = [building()];
    sim.bulldoze([{ kind: 'segment', id: state.segments[0]!.id }]);
    expect(sim.buildRoad('road_small', draft(0, 0, 160, 0)).ok).toBe(true);
    expect(state.buildings[0]!.roadDisconnectedDay).toBeUndefined();
    sim.setSpeed(1);
    for (let i = 0; i < 310; i++) sim.tick();
    expect(state.buildings[0]!.state).toBe('active');
    expect(
      roadAccess(
        world().nodes,
        world().segments,
      )({ ...building(), pos: { x: 40, z: 24 } }),
    ).toBe(false);
  });
});
describe('demolition selection', () => {
  it('selects all junction arms on a click but only the nearest road outside a junction', () => {
    const g = new RoadGraph();
    g.addRoad(road(-160, 0, 160, 0));
    g.addRoad(road(0, -160, 0, 160));
    const w = { ...world(), ...g.snapshot() },
      s = new BulldozeSelection(w);
    expect(s.pick({ x: 0, z: 0 }, { x: 0, z: 0 }, 'segment')).toHaveLength(4);
    expect(s.pick({ x: 60, z: 0 }, { x: 60, z: 0 }, 'segment')).toHaveLength(1);
    expect(s.pick({ x: 300, z: 300 }, { x: 300, z: 300 }, 'segment')).toEqual(
      [],
    );
  });
  it('swept selection has no pointer-sampling gaps and filters building / network targets', () => {
    const w = world();
    w.buildings = [building()];
    w.networks.water = [
      {
        id: 600,
        points: [
          { x: 20, z: 40 },
          { x: 100, z: 40 },
        ],
      },
    ];
    const s = new BulldozeSelection(w);
    expect(s.pick({ x: 40, z: -30 }, { x: 40, z: 60 }, 'segment')).toHaveLength(
      1,
    );
    expect(s.pick({ x: 40, z: 12 }, { x: 40, z: 12 }, 'building')).toEqual([
      { kind: 'building', id: 500 },
    ]);
    expect(s.pick({ x: 40, z: -30 }, { x: 40, z: 60 }, 'network')).toEqual([
      { kind: 'network', id: 600 },
    ]);
  });
});
