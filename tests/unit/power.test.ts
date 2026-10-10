import { RoadGraph } from '../../src/world/roadGraph';
import { describe, it, expect } from 'vitest';
import { POWER } from '../../src/data/power';
import {
  previewPlant,
  previewLine,
  windAt,
  plantOutput,
  shapeDistance,
  type PowerWorld,
} from '../../src/world/power';
import { updatePower } from '../../src/sim/systems/power';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import { WorldMirror } from '../../src/bridge/mirror';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import type { Building } from '../../src/world/types';
import type { SimEvent } from '../../src/bridge/protocol';
const settings = {
  seed: 72,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Power',
};
function b(id: number, x: number, defId = 'RL', z = 0): Building {
  return {
    ...districtFixture(1)[0]!,
    id,
    defId,
    kind: defId.startsWith('power_') ? 'utility' : 'zoned',
    state: 'active',
    pos: { x, z },
    rotation: 0,
    lotW: defId === 'power_coal' ? 6 : 2,
    lotD: defId === 'power_coal' ? 6 : 2,
    households: 10,
    residents: 0,
    jobs: 0,
    workers: 0,
    flags: 8,
  };
}
function state(...buildings: Building[]) {
  const s = createState(settings);
  s.terrain.heights.fill(60);
  s.buildings = buildings;
  return s;
}
function world(): PowerWorld {
  const s = state();
  return {
    ...s,
    heights: s.terrain.heights,
    mode: s.settings.mode,
    networks: [],
  };
}
const powered = (b: Building) => Boolean(b.flags & POWER.flag);
describe('electrical connectivity and island capacity', () => {
  it('conducts through adjacent footprints at 16m and preserves other flags', () => {
    const s = state(b(1, -60, 'power_coal'), b(2, -20), b(3, 12), b(4, 44.01));
    updatePower(s);
    expect(s.buildings.map(powered)).toEqual([true, true, true, false]);
    expect(s.buildings[1]!.flags & 8).toBe(8);
    expect(s.stats.power.produced).toBe(40);
    expect(s.stats.power.consumed).toBeCloseTo(0.18);
    expect(s.stats.power.served).toBeCloseTo(0.12);
  });
  it('connects distant districts by an overhead line and disconnects on its removal', () => {
    const s = state(b(1, -200, 'power_coal'), b(2, 0));
    updatePower(s);
    expect(powered(s.buildings[1]!)).toBe(false);
    s.networks.power = [
      {
        id: 3,
        points: [
          { x: -170, z: 8 },
          { x: -10, z: 8 },
        ],
      },
    ];
    updatePower(s);
    expect(powered(s.buildings[1]!)).toBe(true);
    s.networks.power = [];
    updatePower(s);
    expect(powered(s.buildings[1]!)).toBe(false);
  });
  it('connects intersecting lines and does not depend on insertion order', () => {
    const s = state(b(1, -200, 'power_coal'), b(2, 0, 'RL', 100));
    s.networks.power = [
      {
        id: 3,
        points: [
          { x: -180, z: 20 },
          { x: 0, z: 20 },
        ],
      },
      {
        id: 4,
        points: [
          { x: 0, z: -20 },
          { x: 0, z: 95 },
        ],
      },
    ];
    updatePower(s);
    expect(powered(s.buildings[1]!)).toBe(true);
    s.buildings.reverse();
    s.networks.power.reverse();
    updatePower(s);
    expect(s.buildings.every(powered)).toBe(true);
  });
  it('sheds the farthest loads first and never pools disconnected generators', () => {
    const a = b(2, -20, 'I'),
      c = b(3, 12, 'I');
    a.jobs = 3000;
    c.jobs = 1000;
    const s = state(b(1, -60, 'power_coal'), a, c, b(4, 300, 'power_coal'));
    updatePower(s);
    expect(powered(a)).toBe(true);
    expect(powered(c)).toBe(false);
    expect(s.stats.power).toMatchObject({
      produced: 80,
      consumed: 48,
      served: 36,
      unpowered: 1,
    });
  });
  it('keeps nearer priority even if a smaller far load would fit remaining capacity', () => {
    const a = b(2, -20, 'I'),
      c = b(3, 12, 'I'),
      d = b(4, 44, 'I');
    a.jobs = 3000;
    c.jobs = 1000;
    d.jobs = 100;
    const s = state(b(1, -60, 'power_coal'), a, c, d);
    updatePower(s);
    expect([a, c, d].map(powered)).toEqual([true, false, false]);
  });
  it('combines generators in the same component', () => {
    const a = b(2, -20, 'I');
    a.jobs = 6000;
    const s = state(b(1, -60, 'power_coal'), a, b(3, 28, 'power_coal'));
    updatePower(s);
    expect(powered(a)).toBe(true);
    expect(s.stats.power.served).toBe(72);
  });
  it('excludes unfinished or abandoned relays and consumers', () => {
    const a = b(2, -20),
      c = b(3, 12);
    a.state = 'construction';
    const s = state(b(1, -60, 'power_coal'), a, c);
    updatePower(s);
    expect([a, c].map(powered)).toEqual([false, false]);
    expect(s.stats.power.consumed).toBe(0.06);
    a.state = 'active';
    updatePower(s);
    expect(powered(c)).toBe(true);
    a.state = 'abandoned';
    updatePower(s);
    expect(powered(c)).toBe(false);
  });
  it('uses occupied homes and commercial/industrial/office job capacities', () => {
    const a = b(1, 0, 'CL'),
      i = b(2, 0, 'I'),
      o = b(3, 0, 'O');
    a.jobs = i.jobs = o.jobs = 10;
    const s = state(a, i, o);
    updatePower(s);
    expect(s.stats.power.consumed).toBeCloseTo(0.3);
    expect(s.stats.power.served).toBe(0);
  });
  it('clears power when the last generator disappears without altering unrelated flags', () => {
    const a = b(2, -20),
      s = state(b(1, -60, 'power_coal'), a);
    updatePower(s);
    s.buildings = [a];
    const patches = updatePower(s);
    expect(patches).toEqual([{ id: a.id, flags: 8 }]);
    expect(s.stats.power.produced).toBe(0);
  });
  it('handles an empty city and emits no repeated flag patches', () => {
    const s = state();
    expect(updatePower(s)).toEqual([]);
    expect(s.stats.power).toEqual({
      produced: 0,
      consumed: 0,
      served: 0,
      unpowered: 0,
      groups: 0,
    });
  });
});
describe('deterministic wind and construction validation', () => {
  it('samples a continuous seed-dependent wind map within 0..4MW', () => {
    const values = [];
    for (let x = -2000; x <= 2000; x += 80) {
      const p = { x, z: 19 };
      const n = windAt(72, p);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      expect(plantOutput(72, 'power_wind', p)).toBe(n * 4);
      values.push(n);
    }
    expect(new Set(values).size).toBeGreaterThan(20);
    expect(windAt(72, { x: 1, z: 2 })).not.toBe(windAt(73, { x: 1, z: 2 }));
    expect(windAt(72, { x: 320 - 1e-5, z: 30 })).toBeCloseTo(
      windAt(72, { x: 320 + 1e-5, z: 30 }),
      5,
    );
  });
  it('matches preview output to the simulation and rotates footprint before checking', () => {
    const w = world(),
      p = previewPlant(w, 'power_wind', { x: 0, z: 0 }, Math.PI / 2);
    expect(p.valid).toBe(true);
    expect(p.cost).toBe(2000);
    expect(p.points[2]!.x).toBeCloseTo(16);
    expect(previewPlant(w, 'power_wind', { x: 0, z: 0 }, 1e18).points).toEqual(
      previewPlant(w, 'power_wind', { x: 0, z: 0 }, 1e18 % (Math.PI * 2))
        .points,
    );
    const s = state(b(1, 0, 'power_wind'));
    updatePower(s);
    expect(p.output).toBe(s.stats.power.produced);
  });
  it('rejects missing definitions, nonfinite geometry and unavailable plants', () => {
    const w = world();
    for (const id of ['bad', 'water_pump', 'power_hydro'])
      expect(previewPlant(w, id, { x: 0, z: 0 }, 0).valid).toBe(false);
    expect(previewPlant(w, 'power_wind', { x: NaN, z: 0 }, 0).valid).toBe(
      false,
    );
    expect(previewPlant(w, 'power_coal', { x: 0, z: 0 }, Infinity).valid).toBe(
      false,
    );
    w.unlocked = [];
    expect(previewPlant(w, 'power_wind', { x: 0, z: 0 }, 0).reason).toBe(
      'err.powerLocked',
    );
  });
  it('rejects full-footprint unowned land, water and overlapping buildings', () => {
    const w = world();
    expect(previewPlant(w, 'power_coal', { x: 470, z: 0 }, 0).reason).toBe(
      'err.landNotOwned',
    );
    w.heights.fill(20);
    expect(previewPlant(w, 'power_wind', { x: 0, z: 0 }, 0).reason).toBe(
      'err.powerTerrain',
    );
    w.heights.fill(60);
    w.buildings = [b(1, 0)];
    expect(previewPlant(w, 'power_wind', { x: 0, z: 0 }, 0).reason).toBe(
      'err.buildingConflict',
    );
  });
  it('rejects roads under a plant and insufficient funds without changing the world', () => {
    const w = world(),
      graph = new RoadGraph();
    graph.addRoad({
      start: { x: -160, z: 0 },
      end: { x: 160, z: 0 },
      startHeight: 60,
      endHeight: 60,
      type: 'road_small',
      builtDay: 0,
      paidCost: 800,
    });
    Object.assign(w, graph.snapshot());
    expect(previewPlant(w, 'power_coal', { x: 0, z: 0 }, 0).reason).toBe(
      'err.roadOverlap',
    );
    w.money = 1000;
    expect(previewPlant(w, 'power_coal', { x: 0, z: 80 }, 0).reason).toBe(
      'err.notEnoughMoney',
    );
    expect(w.money).toBe(1000);
  });
  it('charges exact line length units, permits water spans, validates every segment and honors sandbox', () => {
    const w = world();
    w.heights.fill(20);
    const points = [
      { x: 0, z: 0 },
      { x: 65, z: 0 },
    ];
    expect(previewLine(w, points)).toMatchObject({ valid: true, cost: 90 });
    w.money = 89;
    expect(previewLine(w, points).reason).toBe('err.notEnoughMoney');
    w.mode = 'sandbox';
    expect(previewLine(w, points).cost).toBe(0);
    for (const p of [
      [],
      [
        { x: 0, z: 0 },
        { x: 0, z: 0 },
      ],
      [
        { x: 0, z: 0 },
        { x: 1000, z: 0 },
      ],
      [
        { x: 0, z: 0 },
        { x: NaN, z: 0 },
      ],
    ])
      expect(previewLine(w, p).valid).toBe(false);
    expect(
      previewLine(w, [
        { x: 450, z: 0 },
        { x: 490, z: 0 },
      ]).reason,
    ).toBe('err.landNotOwned');
  });
  it('rejects a sub-metre unowned tile corner between valid line endpoints', () => {
    const w = world();
    w.ownedTiles = [12, 13, 17];
    expect(
      previewLine(w, [
        { x: 470, z: 490 },
        { x: 492, z: 469 },
      ]).reason,
    ).toBe('err.landNotOwned');
  });
  it('measures containment, crossing and exact edge gaps', () => {
    const square = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ];
    expect(
      shapeDistance(
        square,
        true,
        [
          { x: 5, z: 5 },
          { x: 6, z: 6 },
        ],
        false,
      ),
    ).toBe(0);
    expect(
      shapeDistance(
        square,
        true,
        [
          { x: 26, z: 0 },
          { x: 26, z: 10 },
        ],
        false,
      ),
    ).toBe(16);
  });
});
describe('worker transactions and mirror', () => {
  it('places, supplies, links and refunds while paused with unique IDs and mirror parity', () => {
    const mirror = new WorldMirror(),
      sim = new Simulation(settings, (e) => mirror.apply(e));
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    sim.setSpeed(0);
    expect(sim.place('power_coal', { x: -200, z: -180 }, Math.PI / 2).ok).toBe(
      true,
    );
    expect(
      sim.buildPowerLine([
        { x: -160, z: -180 },
        { x: -40, z: -180 },
      ]).ok,
    ).toBe(true);
    let s = sim.snapshot();
    expect(s.money).toBe(70000 - 19000 - 150);
    expect(s.stats.power.produced).toBe(40);
    expect(s.buildings[0]!.rotation).toBe(Math.PI / 2);
    expect(s.networks.power[0]!.id).not.toBe(s.buildings[0]!.id);
    expect(mirror.readStats()?.power).toEqual(s.stats.power);
    expect(mirror.readPowerWorld()?.networks).toEqual(s.networks.power);
    const id = s.buildings[0]!.id;
    expect(sim.bulldoze([{ kind: 'building', id }])).toMatchObject({
      ok: true,
      refund: 19000,
    });
    s = sim.snapshot();
    expect(s.stats.power.produced).toBe(0);
    expect(s.money).toBe(70000 - 150);
    expect(mirror.readSnapshot()?.nextId).toBe(s.nextId);
  });
  it('rejects duplicate/invalid placement atomically', () => {
    const sim = new Simulation(settings);
    expect(sim.place('power_wind', { x: -200, z: -180 }, 0).ok).toBe(true);
    // Serialize typed arrays to compact native bytes so full-state atomicity checks
    // do not recursively visit millions of numeric properties in the matcher.
    const snapshot = () =>
      JSON.stringify(sim.snapshot(), (_key, value: unknown) =>
        ArrayBuffer.isView(value)
          ? Buffer.from(
              value.buffer,
              value.byteOffset,
              value.byteLength,
            ).toString('base64')
          : value,
      );
    const before = snapshot();
    expect(sim.place('power_wind', { x: -200, z: -180 }, 0).ok).toBe(false);
    expect(snapshot()).toBe(before);
    expect(
      sim.buildPowerLine([
        { x: 0, z: 0 },
        { x: NaN, z: 0 },
      ]).ok,
    ).toBe(false);
    expect(snapshot()).toBe(before);
  });
  it('validates untrusted place/network payloads', () => {
    const events: SimEvent[] = [],
      d = new CommandDispatcher((e) => events.push(e));
    d.handle({ t: 'init', reqId: 1, ...settings });
    for (const c of [
      { t: 'place', defId: 'power_wind', pos: { x: 0, z: 0 }, rotation: NaN },
      { t: 'buildNetwork', net: 'power', points: [null] },
      {
        t: 'buildNetwork',
        net: 'power',
        points: Array(100).fill({ x: 0, z: 0 }),
      },
    ]) {
      d.handle({ ...c, reqId: 2 });
      expect(events.at(-1)).toMatchObject({ t: 'result', ok: false });
    }
    d.handle({
      t: 'buildNetwork',
      reqId: 3,
      net: 'water',
      points: [
        { x: 0, z: 0 },
        { x: 80, z: 0 },
      ],
    });
    expect(events.at(-1)).toMatchObject({
      ok: true,
      cost: 100,
    });
  });
});
