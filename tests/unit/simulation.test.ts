import { deepStrictEqual } from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import { WorldMirror } from '../../src/bridge/mirror';
import type { SimEvent } from '../../src/bridge/protocol';
import type { CitySettings } from '../../src/world/snapshot';
import { TIME, WORLD } from '../../src/data/config';
import { MAP_PRESETS } from '../../src/data/terrain';
import { SIM_RUNTIME } from '../../src/data/simRuntime';

const settings: CitySettings = {
  seed: MAP_PRESETS[0].seed,
  mapId: 'valley',
  mode: 'normal',
  cityName: 'Test city',
};

describe('authoritative simulation in Node', () => {
  it('optional timing observes each actual step without changing world state or paused progression', () => {
    const a = new Simulation(settings),
      b = new Simulation(settings),
      samples: number[] = [];
    for (const sim of [a, b]) sim.setSpeed(4);
    for (let i = 0; i < 6; i++) {
      expect(a.advance(240, (ms) => samples.push(ms))).toBe(b.advance(240));
    }
    expect(samples).toHaveLength(a.readClock().ticks);
    expect(samples.every((ms) => Number.isFinite(ms) && ms >= 0)).toBe(true);
    deepStrictEqual(a.snapshot(), b.snapshot());
    a.setSpeed(0);
    const n = samples.length;
    expect(a.advance(240, (ms) => samples.push(ms))).toBe(0);
    expect(samples).toHaveLength(n);
  });
  it('creates a reproducible empty city, with configuration and owned center tile', () => {
    const a = new Simulation(settings).snapshot();
    const b = new Simulation(settings).snapshot();
    // Native typed-array byte comparison avoids millions of matcher visits on CI.
    deepStrictEqual(a, b);
    expect(a.money).toBe(70000);
    expect(a.ownedTiles).toEqual([12]);
    expect(a.buildings).toEqual([]);
    expect(a.nextId).toBe(1);
    expect(a.fields.pollution.length).toBe(WORLD.fieldCells ** 2);
    expect(a.budgets.deathcare).toBe(1);
    expect(a.taxRates.RL).toBe(0.09);
  });
  it('separates easy and sandbox configuration', () => {
    expect(new Simulation({ ...settings, mode: 'easy' }).snapshot().money).toBe(
      200000,
    );
    const sandbox = new Simulation({ ...settings, mode: 'sandbox' }).snapshot();
    expect(sandbox.settings.mode).toBe('sandbox');
    expect(sandbox.unlocked.length).toBeGreaterThan(1);
  });
  it('executes direct fixed ticks without a worker and protects every returned buffer', () => {
    const sim = new Simulation(settings);
    for (let i = 0; i < TIME.ticksPerDay + 3; i++) sim.tick();
    expect(sim.readClock()).toMatchObject({ day: 1, tickInDay: 3, ticks: 13 });
    const copy = sim.snapshot();
    const original = copy.terrain.heights[0];
    copy.terrain.heights[0] = -900;
    copy.fields.coverage.police.fill(99);
    copy.settings.cityName = 'Mutated';
    copy.ownedTiles.push(0);
    copy.clock.ticks = 900;
    expect(sim.snapshot().terrain.heights[0]).toBe(original);
    expect(sim.snapshot().fields.coverage.police[0]).toBe(0);
    expect(sim.snapshot().ownedTiles).toEqual([12]);
    expect(sim.snapshot().settings.cityName).toBe(settings.cityName);
    expect(sim.readClock().ticks).toBe(13);
  });
  it.each([1, 2, 4] as const)(
    'runs exactly %i times the normal fixed-step rate',
    (speed) => {
      const sim = new Simulation(settings);
      sim.setSpeed(speed);
      for (let ms = 0; ms < 2400; ms += 20) sim.advance(20);
      expect(sim.readClock().ticks).toBe(10 * speed);
    },
  );
  it('does not advance paused time and preserves pre-pause fractional progress', () => {
    const sim = new Simulation(settings);
    sim.advance(120);
    sim.setSpeed(0);
    sim.tick();
    sim.advance(100000);
    expect(sim.readClock().ticks).toBe(0);
    sim.setSpeed(2);
    expect(sim.advance(60)).toBe(1);
    expect(sim.readClock().ticks).toBe(1);
    expect(sim.advance(0)).toBe(0);
  });
  it('bounds catch-up after suspended tabs instead of simulating hours on resume', () => {
    const sim = new Simulation(settings);
    sim.setSpeed(4);
    expect(sim.advance(3_600_000)).toBe(
      Math.floor((SIM_RUNTIME.maxElapsedMs * 4) / 240),
    );
  });
  it('rejects invalid map settings, speed and elapsed time without corrupting progress', () => {
    for (const change of [
      { seed: NaN },
      { seed: 1.5 },
      { mapId: 'missing' },
      { cityName: '   ' },
      { cityName: 'x'.repeat(65) },
    ])
      expect(() => new Simulation({ ...settings, ...change })).toThrow();
    const sim = new Simulation(settings);
    for (const elapsed of [-1, NaN, Infinity])
      expect(() => sim.advance(elapsed)).toThrow();
    // @ts-expect-error test runtime validation at non-TypeScript callers
    expect(() => sim.setSpeed(3)).toThrow();
    expect(sim.readClock().ticks).toBe(0);
  });
});

describe('command boundary', () => {
  it('requires init, rejects invalid payloads, and correlates every response', () => {
    const events: SimEvent[] = [];
    const commands = new CommandDispatcher((event) => events.push(event));
    commands.handle(null);
    commands.handle({ reqId: -1, t: 'init' });
    expect(events.every((event) => event.t === 'error')).toBe(true);
    commands.handle({ reqId: 1, t: 'setSpeed', speed: 0 });
    expect(events.at(-1)).toMatchObject({
      reqId: 1,
      ok: false,
      reason: 'err.notReady',
    });
    commands.handle({ reqId: 2, t: 'init', ...settings });
    expect(events.at(-1)).toMatchObject({ t: 'ready', reqId: 2 });
    commands.handle({ reqId: 3, t: 'setSpeed', speed: 3 });
    expect(events.at(-1)).toMatchObject({
      reqId: 3,
      ok: false,
      reason: 'err.invalidCommand',
    });
    commands.handle({ reqId: 4, t: 'setSpeed', speed: 0 });
    expect(events.at(-2)).toMatchObject({ t: 'clock', clock: { speed: 0 } });
    expect(events.at(-1)).toMatchObject({ reqId: 4, ok: true });
    const count = events.length;
    commands.advance(240);
    expect(events).toHaveLength(count);
    commands.handle({ reqId: 5, t: 'save' });
    expect(events.at(-1)).toMatchObject({
      reqId: 5,
      ok: false,
      reason: 'err.notImplemented',
    });
    commands.handle({ reqId: 6, t: 'unknown' });
    expect(events.at(-1)).toMatchObject({ reason: 'err.invalidCommand' });
    commands.handle({ reqId: 7, t: 'init', ...settings, cityName: null });
    expect(events.at(-1)).toMatchObject({ reason: 'err.invalidCommand' });
    commands.handle({ reqId: 8, t: 'setSpeed', speed: 4 });
    commands.advance(240);
    expect(events.at(-1)).toMatchObject({
      t: 'clock',
      clock: { ticks: 4, speed: 4 },
    });
    commands.handle({ reqId: 9, t: 'init', ...settings });
    expect(events.at(-1)).toMatchObject({
      t: 'ready',
      snapshot: { clock: { ticks: 0 } },
    });
  });
});

describe('read-only world mirror', () => {
  it('owns cloned snapshots and applies entity removals/upserts and streamed fields', () => {
    const mirror = new WorldMirror();
    expect(mirror.clock).toBeUndefined();
    mirror.apply({
      t: 'clock',
      clock: { day: 1, tickInDay: 0, ticks: 10, speed: 1 },
    });
    const snapshot = new Simulation(settings).snapshot();
    mirror.apply({ t: 'ready', reqId: 1, snapshot });
    snapshot.terrain.heights[0] = -100;
    expect(mirror.readSnapshot()!.terrain.heights[0]).not.toBe(-100);
    const copy = mirror.readSnapshot()!;
    copy.fields.pollution[0] = 9;
    expect(mirror.readSnapshot()!.fields.pollution[0]).toBe(0);
    expect(Object.isFrozen(mirror.clock)).toBe(true);
    const node = {
      id: 1,
      pos: { x: 0, z: 0 },
      height: 10,
      segments: [],
      control: 'none' as const,
    };
    mirror.apply({
      t: 'roadsChanged',
      added: [],
      removed: [],
      nodes: [node],
      removedNodes: [],
    });
    node.pos.x = 100;
    expect(mirror.readSnapshot()!.nodes[0]!.pos.x).toBe(0);
    mirror.apply({
      t: 'roadsChanged',
      added: [],
      removed: [],
      nodes: [],
      removedNodes: [1],
    });
    expect(mirror.readSnapshot()!.nodes).toEqual([]);
    const data = new Float32Array([1, 2, 3]);
    mirror.apply({ t: 'fields', which: 'coverage.health', data });
    mirror.apply({ t: 'vehicles', data, count: 1 });
    data.fill(0);
    expect(mirror.readSnapshot()!.fields.coverage.health[0]).toBe(1);
    expect(mirror.readVehicles().data[0]).toBe(1);
    mirror.apply({ t: 'ready', reqId: 2, snapshot });
    expect(mirror.readVehicles().count).toBe(0);
  });
});
