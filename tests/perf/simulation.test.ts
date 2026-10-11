import { test, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { performanceCity } from '../fixtures/performanceCity';
import { Simulation } from '../../src/sim/simulation';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { hourTicks } from '../../src/world/schedules';

const summarize = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: samples.length,
    meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)]!,
    maxMs: sorted.at(-1)!,
  };
};
test('measure complete 100k simulation ticks and optional destination search', () => {
  const state = performanceCity();
  expect(state.stats.population).toBe(100000);
  const schedules = new ScheduleSystem(state),
    shopping: number[] = [];
  // Repeat the same request burst; this isolates destination search from migration.
  for (let run = 0; run < 12; run++) {
    state.clock.ticks = hourTicks(13);
    state.citizens.tripStatus.fill(0);
    state.citizens.lastShoppingCycle.fill(0);
    state.citizens.lastLeisureCycle.fill(0);
    state.citizens.lastShiftCycle.fill(1);
    state.citizens.locationId.set(state.citizens.homeId);
    const start = performance.now();
    schedules.tick();
    shopping.push(performance.now() - start);
  }
  const fresh = performanceCity();
  fresh.clock.ticks = hourTicks(5);
  fresh.clock.day = Math.floor(fresh.clock.ticks / 10);
  fresh.clock.tickInDay = fresh.clock.ticks % 10;
  const sim = new Simulation(fresh.settings, () => {}, fresh);
  sim.setSpeed(1);
  const ticks: number[] = [],
    daily: number[] = [];
  let completedDay: boolean;
  sim.onDay(() => {
    completedDay = true;
  });
  for (let i = 0; i < 60; i++) {
    completedDay = false;
    const start = performance.now();
    sim.tick();
    const ms = performance.now() - start;
    ticks.push(ms);
    if (completedDay) daily.push(ms);
  }
  const report = {
    populationStart: fresh.stats.population,
    populationEnd: sim.snapshot().stats.population,
    buildings: fresh.buildings.length,
    segments: fresh.segments.length,
    shopping: summarize(shopping.slice(2)),
    ticks: summarize(ticks),
    daily: summarize(daily),
    note: 'Node full Simulation.tick including fiscal-day work; excludes browser postMessage and GPU. Authored unserviced city.',
  };
  console.log(JSON.stringify(report));
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/simulation-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  expect(ticks.every(Number.isFinite)).toBe(true);
}, 120000);
