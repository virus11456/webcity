import { CommandDispatcher } from '../../src/sim/commands';
import { updatePower } from '../../src/sim/systems/power';
import type { SimEvent } from '../../src/bridge/protocol';
import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { RoadGraph } from '../../src/world/roadGraph';
import { parkField, updateParks } from '../../src/sim/systems/parks';
import { previewTrees, treeBrush } from '../../src/world/parks';
import { fieldIndex } from '../../src/world/fieldSampling';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { PARKS } from '../../src/data/parks';
import { serialize, deserialize } from '../../src/save/serializer';
import { citizenJobPlaces } from '../../src/sim/systems/citizens';
function fixture() {
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'normal',
    cityName: 'Parks',
  });
  s.terrain.heights.fill(60);
  s.unlocked = [0, 1, 2, 3, 4, 5];
  const g = new RoadGraph();
  g.addRoad({
    start: { x: -300, z: 0 },
    end: { x: 300, z: 0 },
    type: 'road_small',
    startHeight: 60,
    endHeight: 60,
    builtDay: 0,
  });
  Object.assign(s, g.snapshot());
  s.buildings = [
    {
      ...structuredClone(districtFixture(1)[0]!),
      id: 10001,
      defId: 'RL',
      kind: 'zoned',
      state: 'active',
      pos: { x: 80, z: 9 },
      rotation: 0,
      lotW: 2,
      lotD: 2,
      residents: 0,
      households: 0,
    },
  ];
  s.nextId = 10002;
  return s;
}
describe('parks and bounded tree brush', () => {
  it('rejects malformed and excessive brush commands at the Worker boundary', () => {
    const events: SimEvent[] = [],
      dispatcher = new CommandDispatcher((e) => events.push(e));
    dispatcher.handle({ t: 'init', reqId: 1, ...fixture().settings });
    for (const points of [
      [],
      [{ x: NaN, z: 0 }],
      Array(129).fill({ x: 0, z: 100 }),
      null,
    ]) {
      dispatcher.handle({ t: 'plantTrees', reqId: 2, points });
      expect(events.at(-1)).toMatchObject({
        t: 'result',
        ok: false,
        reason: 'err.invalidCommand',
      });
    }
  });
  it('a line of planted trees cannot bridge electricity between a plant and a home', () => {
    const s = fixture(),
      home = s.buildings[0]!;
    home.pos = { x: 80, z: 104 };
    home.flags = 0;
    s.buildings.push({
      ...home,
      id: 2,
      kind: 'utility',
      defId: 'power_wind',
      pos: { x: 0, z: 100 },
    });
    for (const x of [16, 32, 48, 64])
      s.buildings.push({
        ...home,
        id: 100 + x,
        kind: 'park',
        defId: 'tree',
        lotW: 1,
        lotD: 1,
        pos: { x, z: 104 },
      });
    updatePower(s);
    expect(s.stats.power.produced).toBeGreaterThan(0);
    expect(home.flags & 1).toBe(0);
  });
  it('places every park, increases nearby land value, and reverses the contribution on disable/demolition', () => {
    const s = fixture(),
      sim = new Simulation(s.settings, undefined, s);
    const baseline = sim.snapshot().buildings[0]!.landValue!;
    expect(sim.place('park_small', { x: 0, z: 9 }, 0).ok).toBe(true);
    const placed = sim.snapshot(),
      park = placed.buildings.find((b) => b.defId === 'park_small')!;
    expect(placed.buildings[0]!.landValue).toBeGreaterThan(baseline);
    expect(placed.money).toBe(s.money - 600);
    expect(sim.setBuildingEnabled(park.id, false).ok).toBe(true);
    expect(sim.snapshot().buildings[0]!.landValue).toBe(baseline);
    expect(sim.setBuildingEnabled(park.id, true).ok).toBe(true);
    expect(sim.snapshot().buildings[0]!.landValue).toBeGreaterThan(baseline);
    for (const [id, x] of [
      ['park_playground', 120],
      ['park_plaza', 200],
      ['park_large', -180],
    ] as const)
      expect(sim.place(id, { x, z: 9 }, 0).ok).toBe(true);
    expect(sim.bulldoze([{ kind: 'building', id: park.id }]).ok).toBe(true);
    expect(sim.snapshot().buildings.some((b) => b.id === park.id)).toBe(false);
  });
  it('validates terrain, ownership, money and repeated strokes; charges only accepted trees atomically', () => {
    const s = fixture(),
      sim = new Simulation(s.settings, undefined, s),
      points = treeBrush({ x: 0, z: 100 }, { x: 40, z: 100 });
    const result = sim.plantTrees(points);
    expect(result.ok).toBe(true);
    const a = sim.snapshot(),
      trees = a.buildings.filter((b) => b.defId === 'tree');
    expect(trees.length).toBe(points.length);
    expect(result.cost).toBe(trees.length * 5);
    expect(a.money).toBe(s.money - result.cost!);
    expect(sim.plantTrees(points).ok).toBe(false);
    expect(sim.snapshot().money).toBe(a.money);
    expect(sim.plantTrees([{ x: 2000, z: 2000 }]).ok).toBe(false);
    expect(sim.plantTrees([{ x: 0, z: 0 }]).ok).toBe(false);
    for (const tree of trees)
      expect(citizenJobPlaces(tree).reduce((a, b) => a + b, 0)).toBe(0);
    const poor = fixture();
    poor.money = 1;
    const rejected = new Simulation(poor.settings, undefined, poor);
    expect(rejected.plantTrees(points).reason).toBe('err.notEnoughMoney');
    expect(rejected.snapshot().buildings).toHaveLength(1);
    expect(rejected.snapshot().money).toBe(1);
  });
  it('bounds and deduplicates strokes, skips overlapping buildings, and rejects submerged land', () => {
    expect(
      treeBrush({ x: 0, z: 100 }, { x: 4000, z: 100 }).length,
    ).toBeLessThanOrEqual(PARKS.maxBrushTrees);
    const s = fixture(),
      w = {
        ...s,
        heights: s.terrain.heights,
        mode: s.settings.mode,
        networks: s.networks.power,
      };
    expect(
      previewTrees(w, [
        { x: 80, z: 16 },
        { x: 0, z: 100 },
        { x: 0, z: 100 },
      ]).trees,
    ).toHaveLength(1);
    w.heights.fill(0);
    expect(previewTrees(w, [{ x: 0, z: 100 }]).valid).toBe(false);
  });
  it('uses linear radial falloff, budget scaling, capped trees and clears stale contributions', () => {
    const s = fixture(),
      b = s.buildings[0]!;
    s.buildings = [
      {
        ...b,
        kind: 'park',
        defId: 'park_small',
        pos: { x: 8, z: 0 },
        lotW: 2,
        lotD: 2,
      },
    ];
    const index = fieldIndex({ x: 8, z: 8 }, s.fields.size),
      far = fieldIndex({ x: 400, z: 8 }, s.fields.size);
    expect(parkField(s)[index]).toBeCloseTo(10);
    expect(parkField(s)[far]).toBe(0);
    s.budgets.parks = 0.5;
    expect(parkField(s)[index]).toBeCloseTo(5);
    s.budgets.parks = 1;
    s.buildings = Array.from({ length: 100 }, (_, i) => ({
      ...b,
      id: i + 1,
      kind: 'park',
      defId: 'tree',
      pos: { x: 8, z: 4 },
      lotW: 1,
      lotD: 1,
    }));
    expect(parkField(s)[index]).toBe(PARKS.treeBonusCap);
    updateParks(s);
    s.buildings = [];
    updateParks(s);
    expect(s.fields.landValue[index]).toBe(PARKS.baseLandValue);
  });
  it('round-trips planted trees and park bonuses and keeps them out of the electricity network', async () => {
    const s = fixture(),
      sim = new Simulation(s.settings, undefined, s);
    sim.plantTrees(treeBrush({ x: 0, z: 100 }, { x: 0, z: 100 }));
    const saved = sim.snapshot(),
      loaded = new Simulation(
        s.settings,
        undefined,
        await deserialize(await serialize(saved)),
      ).snapshot();
    expect(loaded.buildings.filter((b) => b.defId === 'tree')).toEqual(
      saved.buildings.filter((b) => b.defId === 'tree'),
    );
    expect(loaded.fields.landValue).toEqual(saved.fields.landValue);
    expect(
      loaded.buildings
        .filter((b) => b.defId === 'tree')
        .every((b) => !(b.flags & 1)),
    ).toBe(true);
  });
});
