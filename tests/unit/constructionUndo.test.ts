import { MILESTONES } from '../../src/data/milestones';
import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { createState } from '../../src/sim/state';
import { WorldMirror } from '../../src/bridge/mirror';
import { CommandDispatcher } from '../../src/sim/commands';
import type { SimEvent } from '../../src/bridge/protocol';
import { serialize, deserialize } from '../../src/save/serializer';
import { uniqueState } from '../fixtures/uniqueCity';
import type { RoadDraft } from '../../src/world/snapshot';
import {
  captureConstruction,
  constructionChange,
  canUndoConstruction,
} from '../../src/world/constructionUndo';
const draft = (ax: number, az: number, bx: number, bz: number): RoadDraft => ({
  start: { x: ax, z: az },
  end: { x: bx, z: bz },
  c1: { x: ax + (bx - ax) / 3, z: az + (bz - az) / 3 },
  c2: { x: ax + (2 * (bx - ax)) / 3, z: az + (2 * (bz - az)) / 3 },
  elevated: false,
});
function fixture(mode: 'normal' | 'sandbox' = 'normal') {
  const s = createState({ seed: 42, mapId: 'valley', mode, cityName: 'Undo' });
  s.terrain.heights.fill(60);
  s.unlocked = MILESTONES.map((m) => m.id);
  s.clock.speed = 0;
  const mirror = new WorldMirror(),
    events: SimEvent[] = [];
  const sim = new Simulation(
    s.settings,
    (e) => {
      events.push(e);
      mirror.apply(e);
    },
    s,
  );
  mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
  return { sim, mirror, events };
}
describe('construction undo', () => {
  it('restores a split crossing, terrain, graph and zoning; refunds once without rewinding time or income', async () => {
    const { sim, mirror } = fixture();
    expect(sim.buildRoad('road_small', draft(-160, 0, 160, 0)).ok).toBe(true);
    const before = sim.snapshot();
    const result = sim.buildRoad('road_small', draft(0, -160, 0, 160));
    expect(result.ok).toBe(true);
    expect(sim.snapshot().segments.length).toBeGreaterThan(
      before.segments.length,
    );
    sim.setSpeed(1);
    for (let i = 0; i < 20; i++) sim.tick();
    sim.setSpeed(0);
    const current = sim.snapshot();
    expect(sim.undo()).toMatchObject({ ok: true, refund: result.cost });
    const after = sim.snapshot();
    expect(after.money).toBe(current.money + result.cost!);
    expect(after.clock).toEqual(current.clock);
    expect(after.statsHistory).toEqual(current.statsHistory);
    expect(after.segments).toEqual(before.segments);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.zoneBlocks).toEqual(before.zoneBlocks);
    expect(after.terrain.heights).toEqual(before.terrain.heights);
    expect(mirror.readSnapshot()!.segments).toEqual(after.segments);
    expect(mirror.readUndo().count).toBe(1);
    expect((await deserialize(await serialize(after))).segments).toEqual(
      after.segments,
    );
    expect(sim.undo().ok).toBe(true);
    const money = sim.snapshot().money;
    expect(sim.undo()).toMatchObject({ ok: false, reason: 'err.undoEmpty' });
    expect(sim.snapshot().money).toBe(money);
  });
  it('keeps exactly ten successful strokes, ignores failures and handles nested tree placement once', () => {
    const { sim, mirror } = fixture();
    for (let i = 0; i < 11; i++)
      expect(sim.place('tree', { x: -240 + i * 32, z: 100 }, 0).ok).toBe(true);
    expect(mirror.readUndo().count).toBe(10);
    expect(sim.place('invalid', { x: 0, z: 0 }, 0).ok).toBe(false);
    expect(mirror.readUndo().count).toBe(10);
    for (let i = 0; i < 10; i++) expect(sim.undo().ok).toBe(true);
    expect(sim.snapshot().buildings).toHaveLength(1);
    expect(sim.undo().ok).toBe(false);
  });
  it('does not refund at seven days and does not mint money in sandbox', () => {
    const { sim } = fixture();
    expect(
      sim.buildPowerLine([
        { x: -80, z: 80 },
        { x: 80, z: 80 },
      ]).ok,
    ).toBe(true);
    sim.setSpeed(1);
    for (let i = 0; i < 70; i++) sim.tick();
    sim.setSpeed(0);
    const before = sim.snapshot();
    expect(sim.undo()).toEqual({ ok: true, refund: 0, cost: 0 });
    expect(sim.snapshot().money).toBe(before.money);
    const free = fixture('sandbox').sim,
      money = free.snapshot().money;
    expect(free.place('power_wind', { x: 80, z: 80 }, 0).ok).toBe(true);
    expect(free.undo()).toMatchObject({ ok: true, refund: 0 });
    expect(free.snapshot().money).toBe(money);
  });
  it('undoes mixed roads, zoning, facilities, power and grouped water pipes in reverse order', () => {
    const { sim, mirror } = fixture();
    const start = sim.snapshot().money;
    expect(sim.buildRoad('road_small', draft(-160, 0, 160, 0)).ok).toBe(true);
    const block = sim.snapshot().zoneBlocks[0]!;
    const cells = Array.from(block.cells)
      .flatMap((v, i) => (v === 0 ? [[block.id, i] as [number, number]] : []))
      .slice(0, 4);
    expect(sim.zone(cells, 'RL').ok).toBe(true);
    expect(sim.place('power_wind', { x: 100, z: 150 }, 0).ok).toBe(true);
    expect(
      sim.buildPowerLine([
        { x: -80, z: 120 },
        { x: 80, z: 120 },
      ]).ok,
    ).toBe(true);
    expect(sim.buildWaterPipes().ok).toBe(true);
    expect(mirror.readUndo().count).toBe(5);
    for (let i = 0; i < 5; i++) expect(sim.undo()).toMatchObject({ ok: true });
    const s = sim.snapshot();
    expect(s.money).toBe(start);
    expect(s.buildings).toHaveLength(0);
    expect(s.segments).toHaveLength(0);
    expect(s.networks).toEqual({ power: [], water: [] });
    expect(s.zoneBlocks).toEqual([]);
  });
  it('restores road upgrade payment so subsequent demolition cannot double refund', () => {
    const { sim } = fixture();
    const initial = sim.snapshot().money;
    const road = sim.buildRoad('road_small', draft(-160, 0, 160, 0));
    expect(road.ok).toBe(true);
    const id = sim.snapshot().segments[0]!.id;
    const upgrade = sim.upgradeRoad(id, 'road_small_trees');
    expect(upgrade.ok).toBe(true);
    expect(sim.undo()).toMatchObject({ ok: true, refund: upgrade.cost });
    expect(sim.snapshot().segments[0]!.paidCost).toBe(road.cost);
    expect(sim.bulldoze([{ kind: 'segment', id }]).ok).toBe(true);
    expect(sim.snapshot().money).toBe(initial);
    const before = sim.snapshot();
    expect(sim.undo()).toMatchObject({ ok: false, reason: 'err.undoConflict' });
    expect(sim.snapshot()).toEqual(before);
  });
  it('restores sandbox ground and detects altered terrain atomically', () => {
    const { sim } = fixture('sandbox'),
      before = sim.snapshot().terrain.heights;
    expect(
      sim.terraform({ mode: 'raise', radius: 32, points: [{ x: 0, z: 128 }] })
        .ok,
    ).toBe(true);
    expect(sim.undo()).toMatchObject({ ok: true, refund: 0 });
    expect(sim.snapshot().terrain.heights).toEqual(before);
    const s = createState({
        seed: 42,
        mapId: 'valley',
        mode: 'sandbox',
        cityName: 'Conflict',
      }),
      capture = captureConstruction(s);
    s.terrain.heights[0]! += 4;
    const entry = constructionChange(capture, s, 'terrain', 0)!;
    s.terrain.heights[0]! += 1;
    expect(canUndoConstruction(s, entry)).toBe(false);
  });
  it('undoes a rebuilt facility after construction advances, preserving elapsed days and stocks', () => {
    const s = uniqueState();
    s.buildings = s.buildings.filter((b) => b.defId === 'police_station');
    const b = s.buildings[0]!;
    b.state = 'burned';
    b.fire = { burning: false, damage: 1, startedDay: 0 };
    b.bodies = { pending: 2 };
    const sim = new Simulation(s.settings, undefined, s),
      money = sim.snapshot().money;
    const r = sim.rebuild(b.id);
    expect(r.ok).toBe(true);
    sim.setSpeed(1);
    for (let i = 0; i < 10; i++) sim.tick();
    sim.setSpeed(0);
    const clock = sim.readClock();
    expect(sim.undo()).toMatchObject({ ok: true, refund: r.cost });
    expect(sim.readClock()).toEqual(clock);
    expect(sim.snapshot().buildings[0]).toMatchObject({
      state: 'burned',
      bodies: { pending: 2 },
    });
    expect(sim.snapshot().money).toBe(money);
  });
  it('supports the Worker boundary and deliberately starts a loaded city with no session history', async () => {
    const events: SimEvent[] = [],
      d = new CommandDispatcher((e) => events.push(e));
    d.handle({
      t: 'init',
      reqId: 1,
      seed: 42,
      mapId: 'valley',
      mode: 'normal',
      cityName: 'Undo',
    });
    d.handle({ t: 'undo', reqId: 2, refund: 99999 });
    expect(events.at(-1)).toMatchObject({
      t: 'result',
      reqId: 2,
      ok: false,
      reason: 'err.undoEmpty',
    });
    const { sim } = fixture();
    expect(sim.place('tree', { x: 0, z: 80 }, 0).ok).toBe(true);
    const saved = await deserialize(await serialize(sim.snapshot()));
    expect(
      new Simulation(saved.settings, undefined, saved).undo(),
    ).toMatchObject({ ok: false, reason: 'err.undoEmpty' });
  });
  it('restores buildings removed by widening as empty structures without resurrecting displaced citizens', async () => {
    const s = uniqueState();
    s.buildings = s.buildings.filter((b) => b.defId === 'RL');
    s.buildings[0]!.residents = 3;
    s.buildings[0]!.households = 1;
    const sim = new Simulation(s.settings, undefined, s),
      before = sim.snapshot(),
      id = before.segments[0]!.id;
    expect(before.citizens.count).toBeGreaterThan(0);
    expect(sim.upgradeRoad(id, 'road_medium').ok).toBe(true);
    expect(sim.snapshot().buildings).toHaveLength(0);
    expect(sim.undo().ok).toBe(true);
    const after = sim.snapshot();
    expect(after.buildings[0]!.id).toBe(before.buildings[0]!.id);
    expect(after.buildings[0]!.residents).toBe(0);
    expect(after.citizens.count).toBe(0);
    await expect(deserialize(await serialize(after))).resolves.toBeDefined();
  });
  it('reverses zoning after private construction, retaining occupancy and scheduling normal removal', () => {
    const { sim } = fixture('sandbox');
    sim.buildRoad('road_small', draft(-160, 0, 160, 0));
    const block = sim.snapshot().zoneBlocks[0]!;
    const cells = Array.from(block.cells).flatMap((v, i) =>
      v === 0 ? [[block.id, i] as [number, number]] : [],
    );
    expect(sim.zone(cells, 'RL').ok).toBe(true);
    sim.setSpeed(1);
    for (let i = 0; i < 30; i++) sim.tick();
    sim.setSpeed(0);
    const before = sim.snapshot();
    expect(before.buildings.length).toBeGreaterThan(0);
    expect(sim.undo().ok).toBe(true);
    const after = sim.snapshot();
    expect(after.clock).toEqual(before.clock);
    expect(after.buildings.map((b) => b.id)).toEqual(
      before.buildings.map((b) => b.id),
    );
    expect(after.buildings.every((b) => b.rezoneAtTick !== undefined)).toBe(
      true,
    );
    expect(
      after.zoneBlocks
        .flatMap((b) => Array.from(b.buildingAt))
        .filter((id) => id > 0).length,
    ).toBeGreaterThan(0);
  });
});
