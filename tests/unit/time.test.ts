import { INITIAL_DEMAND } from '../../src/data/zones';
import { describe, expect, it } from 'vitest';
import { dateForDay } from '../../src/world/calendar';
import { TimeSystem } from '../../src/sim/systems/time';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import { WorldMirror } from '../../src/bridge/mirror';
import type { SimEvent } from '../../src/bridge/protocol';
import type { CitySettings, SimClock } from '../../src/world/snapshot';
import { TIME } from '../../src/data/config';

const settings: CitySettings = {
  seed: 20261006,
  mapId: 'valley',
  mode: 'normal',
  cityName: 'Time test',
};
const clock = (): SimClock => ({ day: 0, tickInDay: 0, ticks: 0, speed: 1 });

describe('calendar arithmetic', () => {
  it.each([
    [0, '2026-01-01'],
    [30, '2026-01-31'],
    [31, '2026-02-01'],
    [365, '2027-01-01'],
    [789, '2028-02-29'],
    [790, '2028-03-01'],
  ])('formats completed day %i as %s', (day, expected) => {
    expect(dateForDay(day as number)).toBe(expected);
  });
  it('rejects negative, fractional and non-finite days', () => {
    for (const day of [-1, 0.5, NaN, Infinity])
      expect(() => dateForDay(day)).toThrow();
  });
});

describe('daily and weekly boundaries', () => {
  it('fires days once, then weekly on day 7 and 14, never at initialization', () => {
    const time = new TimeSystem(),
      c = clock();
    const order: string[] = [];
    time.onDay((b) => {
      expect(Object.isFrozen(b)).toBe(true);
      order.push(`day:${b.day}`);
    });
    time.onWeek((b) => {
      expect(b.completedWeeks).toBe(b.day / 7);
      order.push(`week:${b.day}:${b.date}`);
    });
    for (let i = 0; i < 69; i++) time.tick(c);
    expect(order).toEqual(Array.from({ length: 6 }, (_, i) => `day:${i + 1}`));
    time.tick(c);
    expect(order.slice(-2)).toEqual(['day:7', 'week:7:2026-01-08']);
    for (let i = 0; i < 70; i++) time.tick(c);
    expect(order.slice(-2)).toEqual(['day:14', 'week:14:2026-01-15']);
    expect(order).toHaveLength(16);
  });
  it('does not cross a day while paused and supports removing hooks', () => {
    const time = new TimeSystem(),
      c = clock();
    let days = 0,
      weeks = 0;
    const offDay = time.onDay(() => days++);
    const offWeek = time.onWeek(() => weeks++);
    for (let i = 0; i < 69; i++) time.tick(c);
    c.speed = 0;
    for (let i = 0; i < 100; i++) expect(time.tick(c)).toBe(false);
    expect(c.ticks).toBe(69);
    c.speed = 4;
    time.tick(c);
    expect([days, weeks]).toEqual([7, 1]);
    offDay();
    offDay();
    offWeek();
    for (let i = 0; i < 70; i++) time.tick(c);
    expect([days, weeks]).toEqual([7, 1]);
  });
  it.each([1, 2, 4] as const)(
    'completes a day at exactly the configured ×%i duration',
    (speed) => {
      const events: SimEvent[] = [];
      const sim = new Simulation(settings, (event) => events.push(event));
      sim.setSpeed(speed);
      const milliseconds = TIME.secondsPerDay[speed] * 1000;
      for (let elapsed = 0; elapsed < milliseconds - 1; elapsed++)
        sim.advance(1);
      expect(sim.readClock().day).toBe(0);
      expect(events).toEqual([]);
      sim.advance(1);
      expect(sim.readClock().day).toBe(1);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        t: 'stats',
        stats: { day: 1, population: 0, money: 70000 },
      });
    },
  );
  it('publishes stats after daily work and weekly settlement; event and history are isolated', () => {
    const events: SimEvent[] = [];
    const sim = new Simulation(settings, (event) => events.push(event));
    sim.onDay((state) => {
      state.stats.expenses++;
    });
    sim.onWeek((state) => {
      state.money += 123;
      state.stats.income = 123;
    });
    for (let i = 0; i < 70; i++) sim.tick();
    const dailyStats = events.filter((e) => e.t === 'stats');
    expect(dailyStats).toHaveLength(7);
    expect(events.slice(-3).map((e) => e.t)).toEqual([
      'fundsChanged',
      'economy',
      'stats',
    ]);
    expect(events.at(-1)).toMatchObject({
      t: 'stats',
      stats: { day: 7, population: 0, expenses: 0, money: 70123, income: 123 },
    });
    const snapshot = sim.snapshot();
    expect(snapshot.statsHistory.map((s) => s.expenses)).toEqual([
      1, 2, 3, 4, 5, 6, 0,
    ]);
    dailyStats[6]!.stats.demand.R = 100;
    snapshot.statsHistory[0]!.power.produced = 500;
    sim.tick();
    expect(sim.snapshot().stats.demand.R).toBe(INITIAL_DEMAND.R);
    expect(sim.snapshot().statsHistory[6]!.demand.R).toBe(INITIAL_DEMAND.R);
    expect(sim.snapshot().statsHistory[0]!.power.produced).toBe(0);
  });
  it('runs 100 deterministic days with exactly 100 daily and 14 weekly hooks', () => {
    const sim = new Simulation(settings);
    let days = 0,
      weeks = 0;
    sim.onDay(() => days++);
    sim.onWeek(() => weeks++);
    for (let i = 0; i < 100 * TIME.ticksPerDay; i++) sim.tick();
    const snapshot = sim.snapshot();
    expect([days, weeks, snapshot.statsHistory.length]).toEqual([100, 14, 100]);
    expect(snapshot.stats).toMatchObject({
      day: 100,
      money: 70000,
      population: 0,
    });
    expect(dateForDay(snapshot.clock.day)).toBe('2026-04-11');
  });
  it('forwards one stats event per day through the dispatcher into the mirror and resets on init', () => {
    const events: SimEvent[] = [],
      mirror = new WorldMirror();
    const commands = new CommandDispatcher((event) => {
      events.push(event);
      mirror.apply(event);
    });
    commands.handle({ t: 'init', reqId: 1, ...settings });
    for (let i = 0; i < 20; i++) commands.advance(240);
    expect(events.filter((e) => e.t === 'stats')).toHaveLength(2);
    expect(mirror.readSnapshot()!.statsHistory.map((s) => s.day)).toEqual([
      1, 2,
    ]);
    expect(mirror.readSnapshot()!.stats.day).toBe(2);
    commands.handle({ t: 'setSpeed', reqId: 2, speed: 0 });
    commands.advance(240);
    expect(events.filter((e) => e.t === 'stats')).toHaveLength(2);
    commands.handle({ t: 'init', reqId: 3, ...settings });
    expect(mirror.readSnapshot()!.statsHistory).toEqual([]);
    expect(mirror.readSnapshot()!.stats.day).toBe(0);
  });
});
