import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { WorldMirror } from '../../src/bridge/mirror';
import { lerp } from '../../src/core/math';
import {
  previewRoadUpgrade,
  pickUpgradeRoad,
  upgradedPayment,
} from '../../src/world/roadUpgrade';
import { rebuildZoneGrid } from '../../src/world/zoneGrid';
import { roadAccess } from '../../src/world/roadAccess';
import { PROBLEMS } from '../../src/data/simulation';
import { serialize, deserialize } from '../../src/save/serializer';
import type { Building } from '../../src/world/types';
import type { RoadTypeId } from '../../src/data/roads';
const settings = {
  seed: 1,
  mapId: 'valley',
  cityName: 'Upgrade',
  mode: 'normal' as const,
};
const draft = (z = 0) => {
  const start = { x: -80, z },
    end = { x: 80, z };
  return {
    start,
    end,
    c1: lerp(start, end, 1 / 3),
    c2: lerp(start, end, 2 / 3),
    elevated: false,
  };
};
function setup(type: RoadTypeId = 'gravel') {
  const initial = new Simulation(settings).snapshot();
  initial.terrain.heights.fill(60);
  initial.unlocked = [0, 1, 2, 3, 4];
  const sim = new Simulation(settings, undefined, initial);
  expect(sim.buildRoad(type, draft()).ok).toBe(true);
  return sim;
}
const building = (id: number, x: number, z: number): Building => ({
  id,
  kind: 'zoned',
  defId: 'RL',
  level: 1,
  pos: { x, z },
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
});
describe('road upgrades', () => {
  it('charges only positive construction difference and keeps IDs and the mirror current', () => {
    const initial = setup().snapshot(),
      mirror = new WorldMirror();
    mirror.apply({ t: 'ready', reqId: 1, snapshot: initial });
    const sim = new Simulation(settings, (e) => mirror.apply(e), initial),
      id = initial.segments[0]!.id;
    expect(sim.upgradeRoad(id, 'road_small')).toEqual({ ok: true, cost: 240 });
    const after = sim.snapshot();
    expect(after.money).toBe(initial.money - 240);
    expect(after.segments[0]!.id).toBe(id);
    expect(mirror.readRoadWorld()!.segments).toEqual(after.segments);
    expect(sim.upgradeRoad(id, 'gravel')).toEqual({ ok: true, cost: 0 });
  });
  it('rejects unavailable, invalid and unaffordable upgrades without mutation', () => {
    const initial = setup().snapshot();
    initial.money = 1;
    initial.unlocked = [0];
    const sim = new Simulation(settings, undefined, initial),
      before = sim.snapshot(),
      id = before.segments[0]!.id;
    expect(sim.upgradeRoad(id, 'road_medium').reason).toBe('err.roadLocked');
    expect(sim.upgradeRoad(id, 'road_small').reason).toBe('err.notEnoughMoney');
    expect(sim.upgradeRoad(-1, 'gravel').reason).toBe('err.invalidCommand');
    expect(sim.snapshot()).toEqual(before);
  });
  it('removes only buildings physically overlapped by widening and retains setbacks when narrowing', async () => {
    const initial = setup('road_small').snapshot();
    initial.buildings = [building(500, -40, 8), building(501, 40, 16)];
    initial.nextId = 502;
    const sim = new Simulation(settings, undefined, initial),
      id = initial.segments[0]!.id;
    expect(sim.upgradeRoad(id, 'road_medium').ok).toBe(true);
    expect(sim.snapshot().buildings.map((b) => b.id)).toEqual([501]);
    const wide = sim.snapshot();
    wide.buildings[0]!.pos.z = 12;
    const narrowing = new Simulation(settings, undefined, wide);
    expect(narrowing.upgradeRoad(id, 'gravel').ok).toBe(true);
    const s = narrowing.snapshot();
    expect(s.buildings[0]!.frontageSetbackM).toBe(8);
    expect(roadAccess(s.nodes, s.segments)(s.buildings[0]!)).toBe(true);
    const decoded = await deserialize(await serialize(s));
    expect(decoded.buildings[0]!.frontageSetbackM).toBe(8);
  });
  it('reverses one-way controls without moving zoning even after later rebuilds and save/load', async () => {
    const initial = setup('road_small_oneway').snapshot();
    for (const b of initial.zoneBlocks)
      for (let i = 0; i < b.cells.length; i++)
        if (b.cells[i] === 0) b.cells[i] = 1;
    const sim = new Simulation(settings, undefined, initial),
      old = initial.segments[0]!;
    expect(sim.upgradeRoad(old.id, old.type)).toEqual({ ok: true, cost: 0 });
    const s = sim.snapshot(),
      r = s.segments[0]!;
    expect([r.start, r.end, r.c1, r.c2]).toEqual([
      old.end,
      old.start,
      old.c2,
      old.c1,
    ]);
    expect(s.zoneBlocks).toEqual(initial.zoneBlocks);
    const grid = rebuildZoneGrid({ ...s, heights: s.terrain.heights });
    expect(grid.blocks).toEqual(s.zoneBlocks);
    const decoded = await deserialize(await serialize(s));
    expect(decoded.segments[0]!.zoningReversed).toBe(true);
    expect(sim.upgradeRoad(old.id, old.type).ok).toBe(true);
    expect(sim.snapshot().segments[0]!.start).toBe(old.start);
  });
  it('picks the nearest road and preserves earned refund age', () => {
    const s = setup().snapshot(),
      w = { ...s, heights: s.terrain.heights, mode: s.settings.mode },
      r = s.segments[0]!;
    expect(pickUpgradeRoad(w, { x: 0, z: 2 })).toBe(r.id);
    expect(pickUpgradeRoad(w, { x: 0, z: 100 })).toBeUndefined();
    expect(
      previewRoadUpgrade(w, r.id, 'road_small').removedBuildingIndices,
    ).toEqual([]);
    expect(
      upgradedPayment({ ...r, builtDay: 0, paidCost: 160 }, 0, 10),
    ).toEqual({ builtDay: 0, paidCost: 160 });
    expect(
      upgradedPayment({ ...r, builtDay: 0, paidCost: 160 }, 240, 10),
    ).toEqual({ builtDay: 10, paidCost: 240 });
    expect(
      upgradedPayment({ ...r, builtDay: 0, paidCost: 160 }, 240, 2),
    ).toEqual({ builtDay: 0, paidCost: 400 });
  });
});
