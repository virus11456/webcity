import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import { WorldMirror } from '../../src/bridge/mirror';
import type { SimEvent } from '../../src/bridge/protocol';
import { lerp } from '../../src/core/math';
import type { RoadDraft } from '../../src/world/snapshot';
import {
  isStraightRoadDraft,
  validateRoadDraft,
} from '../../src/world/roadConstruction';
import { meshHeightAt } from '../../src/world/heightField';
const settings = {
  seed: 20261006,
  mapId: 'valley',
  cityName: 'Test',
  mode: 'normal' as const,
};
const p = (x: number, z: number) => ({ x, z });
const draft = (start = p(-160, -80), end = p(-80, -80)): RoadDraft => ({
  start,
  end,
  c1: lerp(start, end, 1 / 3),
  c2: lerp(start, end, 2 / 3),
  elevated: false,
});
function setup(money = 70000) {
  const events: SimEvent[] = [],
    mirror = new WorldMirror();
  const sim = new Simulation(settings, (e) => {
    events.push(e);
    mirror.apply(e);
  });
  const off = sim.onDay((state) => {
    state.money = money;
  });
  for (let i = 0; i < 10; i++) sim.tick();
  off();
  mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
  events.length = 0;
  return { sim, events, mirror };
}
describe('authoritative road construction', () => {
  it('builds while paused, charges exactly once and updates mirror funds and IDs immediately', () => {
    const { sim, mirror, events } = setup();
    sim.setSpeed(0);
    const before = sim.readClock();
    expect(sim.buildRoad('road_small', draft())).toEqual({
      ok: true,
      cost: 200,
    });
    expect(events.map((e) => e.t)).toEqual(['roadsChanged', 'fundsChanged']);
    const actual = sim.snapshot(),
      view = mirror.readRoadWorld()!;
    expect(actual.money).toBe(69800);
    expect(actual.stats.money).toBe(69800);
    expect(view.money).toBe(actual.money);
    expect(view.nextId).toBe(actual.nextId);
    expect(view.segments).toEqual(actual.segments);
    expect(view.nodes).toEqual(actual.nodes);
    expect(sim.readClock()).toEqual(before);
    expect(mirror.readSnapshot()!.statsHistory).toHaveLength(1);
    const count = events.length;
    expect(sim.buildRoad('road_small', draft())).toMatchObject({
      ok: false,
      reason: 'err.roadOverlap',
    });
    expect(events).toHaveLength(count);
    expect(sim.snapshot().money).toBe(69800);
  });
  it('rejects insufficient funds atomically and permits an exact remaining balance', () => {
    const { sim, events } = setup(199),
      before = sim.snapshot();
    expect(sim.buildRoad('road_small', draft())).toEqual({
      ok: false,
      reason: 'err.notEnoughMoney',
    });
    expect(events).toEqual([]);
    expect(sim.snapshot().nextId).toBe(before.nextId);
    expect(sim.snapshot().segments).toEqual([]);
    expect(sim.snapshot().money).toBe(199);
    const exact = setup(200).sim;
    expect(exact.buildRoad('road_small', draft()).ok).toBe(true);
    expect(exact.snapshot().money).toBe(0);
  });
  it('enforces unlocks but supports unlimited funds in sandbox', () => {
    const { sim } = setup();
    expect(sim.buildRoad('road_large', draft())).toMatchObject({
      ok: false,
      reason: 'err.roadLocked',
    });
    const sandbox = new Simulation({ ...settings, mode: 'sandbox' });
    expect(sandbox.buildRoad('road_large', draft())).toEqual({
      ok: true,
      cost: 0,
    });
    expect(sandbox.snapshot().money).toBe(70000);
  });
  it('joins ground crossings on real nonplanar terrain instead of treating them as overpasses', () => {
    const { sim, mirror } = setup();
    expect(
      sim.buildRoad('road_small', draft(p(-200, -80), p(-40, -80))).ok,
    ).toBe(true);
    expect(
      sim.buildRoad('road_small', draft(p(-120, -160), p(-120, 0))).ok,
    ).toBe(true);
    const s = sim.snapshot(),
      junction = s.nodes.find((n) => n.segments.length === 4)!;
    expect(junction).toBeDefined();
    expect(s.segments).toHaveLength(4);
    expect(junction.height).toBeCloseTo(
      meshHeightAt(s.terrain.heights, -120, -80),
    );
    expect(mirror.readRoadWorld()!.nextId).toBe(s.nextId);
    const result = sim.buildRoad('road_small', draft(p(-40, -80), p(40, -80)));
    expect(result.ok).toBe(true);
    expect(
      new Set(
        [...sim.snapshot().nodes, ...sim.snapshot().segments].map((x) => x.id),
      ).size,
    ).toBe(sim.snapshot().nodes.length + sim.snapshot().segments.length);
  });
  it('uses the same exact draft geometry for preview and worker at T connections', () => {
    const { sim, mirror } = setup();
    sim.buildRoad('road_small', draft(p(-200, -80), p(-40, -80)));
    const points = draft(p(-123, -160), p(-123, -80));
    const preview = validateRoadDraft(
      'road_small',
      points,
      mirror.readRoadWorld()!,
    );
    expect(preview.canBuild).toBe(true);
    expect(sim.buildRoad('road_small', points)).toEqual({
      ok: true,
      cost: preview.preview!.cost,
    });
    expect(sim.snapshot().nodes.some((n) => n.segments.length === 3)).toBe(
      true,
    );
  });
  it('rejects unowned land without terrain or money changes', () => {
    const { sim } = setup();
    const before = sim.snapshot();
    expect(
      sim.buildRoad('road_small', draft(p(-500, 0), p(-600, 0))),
    ).toMatchObject({ ok: false, reason: 'err.landNotOwned' });
    expect(sim.snapshot().money).toBe(before.money);
    expect(sim.snapshot().nextId).toBe(before.nextId);
    expect(sim.snapshot().terrain.revision).toBe(before.terrain.revision);
  });
  it('guards malformed, curved and elevated payloads at the worker boundary', () => {
    const events: SimEvent[] = [],
      commands = new CommandDispatcher((e) => events.push(e));
    commands.handle({
      reqId: 1,
      t: 'buildRoad',
      type: 'road_small',
      points: draft(),
    });
    expect(events.at(-1)).toMatchObject({ reason: 'err.notReady' });
    commands.handle({ reqId: 2, t: 'init', ...settings });
    for (const points of [
      null,
      {},
      { ...draft(), elevated: true },
      { ...draft(), start: p(NaN, 0) },
      { ...draft(), c1: p(0, 0) },
    ]) {
      expect(isStraightRoadDraft(points)).toBe(false);
      commands.handle({ reqId: 3, t: 'buildRoad', type: 'road_small', points });
      expect(events.at(-1)).toMatchObject({
        t: 'result',
        ok: false,
        reason: 'err.invalidCommand',
      });
    }
    commands.handle({
      reqId: 4,
      t: 'buildRoad',
      type: 'unknown',
      points: draft(),
    });
    expect(events.at(-1)).toMatchObject({ reason: 'err.invalidCommand' });
    commands.handle({
      reqId: 5,
      t: 'buildRoad',
      type: 'road_small',
      points: draft(),
      cost: -999999,
    });
    expect(events.at(-1)).toMatchObject({ reqId: 5, ok: true, cost: 200 });
  });
});
