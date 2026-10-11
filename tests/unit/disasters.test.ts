import { describe, it, expect } from 'vitest';
import { uniqueState } from '../fixtures/uniqueCity';
import { updateDisasters } from '../../src/sim/systems/disasters';
import {
  emptyDisasters,
  nextDisasterDay,
  rebuildCost,
} from '../../src/world/disasters';
import { DISASTERS as D } from '../../src/data/disasters';
import { Simulation } from '../../src/sim/simulation';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import { CommandDispatcher } from '../../src/sim/commands';
import { GrowthSystem } from '../../src/sim/systems/growth';
import { WorldMirror } from '../../src/bridge/mirror';
import type { SimEvent } from '../../src/bridge/protocol';
import { GROWTH } from '../../src/data/zones';
import { TIME } from '../../src/data/config';

describe('optional disaster forecast and recovery', () => {
  it('is off by default; seeds determine a bounded schedule and a three-day saved warning', async () => {
    const s = uniqueState(),
      events: SimEvent[] = [];
    expect(s.disasters).toEqual(emptyDisasters());
    for (let day = 0; day < 100; day++) {
      s.clock.day = day;
      expect(updateDisasters(s, (e) => events.push(e))).toEqual([]);
    }
    expect(events).toEqual([]);
    const next = nextDisasterDay(s.seed, 100);
    expect(next).toBeGreaterThanOrEqual(114);
    expect(next).toBeLessThanOrEqual(135);
    expect(next).toBe(nextDisasterDay(s.seed, 100));
    s.disasters = { enabled: true, nextDay: next, warning: null };
    s.clock.day = next;
    updateDisasters(s, (e) => events.push(e));
    expect(s.disasters.warning?.dueDay).toBe(next + 3);
    expect(
      events.some(
        (e) => e.t === 'notify' && e.params?.code === 'disasterWarning',
      ),
    ).toBe(true);
    const restored = await deserialize(await serialize(s));
    expect(restored.disasters).toEqual(s.disasters);
    expect(updateDisasters(s, () => {})).toEqual([]);
    s.clock.day = next + 3;
    const ids = updateDisasters(s, (e) => events.push(e));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(D.maxBuildings);
    expect(s.buildings.filter((b) => b.fire?.burning).map((b) => b.id)).toEqual(
      ids,
    );
    expect(s.disasters.warning).toBeNull();
    expect(updateDisasters(s, () => {})).toEqual([]);
  });
  it('bounds the affected radius and count; missing targets cancel rather than move the strike', () => {
    const s = uniqueState(),
      base = s.buildings[0]!;
    s.buildings = Array.from({ length: 8 }, (_, i) => ({
      ...structuredClone(base),
      id: 100 + i,
      pos: { x: i * 30, z: 9 },
    }));
    s.disasters = {
      enabled: true,
      nextDay: null,
      warning: { target: 100, pos: { x: 0, z: 9 }, dueDay: 0 },
    };
    expect(updateDisasters(s, () => {})).toEqual([100, 101, 102]);
    s.disasters.warning = { target: 999, pos: { x: 0, z: 9 }, dueDay: 0 };
    s.disasters.nextDay = null;
    expect(updateDisasters(s, () => {})).toEqual([]);
    expect(s.disasters.warning).toBeNull();
  });
  it('disabling cancels forecasts but preserves an active fire; redundant enable does not reroll', () => {
    const s = uniqueState();
    s.buildings[0]!.fire = { burning: true, damage: 0, startedDay: 0 };
    const events: SimEvent[] = [],
      sim = new Simulation(s.settings, (e) => events.push(e), s);
    sim.setDisasters(true);
    const first = sim.snapshot().disasters;
    sim.setDisasters(true);
    expect(sim.snapshot().disasters).toEqual(first);
    sim.setDisasters(false);
    expect(sim.snapshot().disasters).toEqual(emptyDisasters());
    expect(sim.snapshot().buildings[0]!.fire?.burning).toBe(true);
    const mirror = new WorldMirror();
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    for (const e of events) mirror.apply(e);
    const copy = mirror.readDisasters()!;
    copy.enabled = true;
    expect(mirror.readDisasters()?.enabled).toBe(false);
  });
  it('rebuild charges once, preserves remains and restarts the full construction lifecycle', async () => {
    const s = uniqueState(),
      b = s.buildings[0]!;
    b.state = 'burned';
    b.fire = { burning: false, damage: 1, startedDay: 0 };
    b.bodies = { pending: 2 };
    const sim = new Simulation(s.settings, () => {}, s),
      before = sim.snapshot().money;
    expect(sim.rebuild(b.id)).toMatchObject({ ok: true, cost: 2000 });
    expect(sim.rebuild(b.id).ok).toBe(false);
    const saved = await deserialize(await serialize(sim.snapshot())),
      rebuilt = saved.buildings[0]!;
    expect(saved.money).toBe(before - 2000);
    expect(rebuilt.state).toBe('construction');
    expect(rebuilt.bodies?.pending).toBe(2);
    expect(rebuilt.fire?.damage).toBe(0);
    expect(rebuilt.constructionStartedTick).toBe(saved.clock.ticks);
    Object.assign(s, saved, { terrain: s.terrain });
    s.clock.ticks += GROWTH.constructionDays * TIME.ticksPerDay;
    new GrowthSystem().tick(s);
    expect(s.buildings[0]!.state).toBe('active');
  });
  it('rejects insufficient funds and rezoned ruins; sandbox is free and zoned cost uses footprint', () => {
    const s = uniqueState(),
      b = s.buildings[0]!;
    b.state = 'burned';
    s.money = 0;
    expect(new Simulation(s.settings, () => {}, s).rebuild(b.id)).toMatchObject(
      { ok: false, reason: 'err.notEnoughMoney' },
    );
    s.settings.mode = 'sandbox';
    const sim = new Simulation(s.settings, () => {}, s);
    expect(sim.rebuild(b.id)).toMatchObject({ ok: true, cost: 0 });
    b.rezoneAtTick = 10;
    expect(new Simulation(s.settings, () => {}, s).rebuild(b.id).ok).toBe(
      false,
    );
    expect(rebuildCost({ ...b, kind: 'zoned', lotW: 2, lotD: 3 })).toBe(1500);
  });
  it('migrates old saves to disabled, rejects malformed states and command payloads', () => {
    const s = uniqueState();
    delete s.disasters;
    expect(migrateSave(s, 1).disasters).toEqual(emptyDisasters());
    s.disasters = { enabled: false, nextDay: 3, warning: null };
    expect(() => migrateSave(s, 1)).toThrow();
    const out: SimEvent[] = [],
      d = new CommandDispatcher((e) => out.push(e));
    d.handle({ t: 'init', reqId: 1, ...uniqueState().settings });
    d.handle({ t: 'setDisasters', reqId: 2, enabled: 'yes' });
    d.handle({ t: 'rebuild', reqId: 3, id: NaN });
    expect(out.slice(-2)).toMatchObject([
      { ok: false, reason: 'err.invalidCommand' },
      { ok: false, reason: 'err.invalidCommand' },
    ]);
  });
});
