import type { SimEvent } from '../../src/bridge/protocol';
import { Simulation } from '../../src/sim/simulation';
import { hourTicks } from '../../src/world/schedules';
import { test, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performanceCity } from '../fixtures/performanceCity';
import { CitizenSystem } from '../../src/sim/systems/citizens';
import { ServiceSystem } from '../../src/sim/systems/services';

test('measure service coverage and school assignment with 100k residents and 96 schools', () => {
  const s = performanceCity();
  for (const b of s.buildings) b.frontageSetbackM = 8;
  const base = s.buildings[0]!;
  for (let row = 0; row < 32; row++)
    for (const [index, defId] of [
      'school_elementary',
      'school_high',
      'university',
    ].entries()) {
      s.buildings.push({
        ...structuredClone(base),
        id: s.nextId++,
        defId,
        kind: 'service',
        pos: { x: (index - 1) * 640, z: row * 64 - 1024 },
        housing: undefined,
        households: 0,
        residents: 0,
        jobs: 0,
        workers: 0,
      });
    }
  const services = new ServiceSystem(s),
    coverage: number[] = [],
    schools: number[] = [];
  for (let run = 0; run < 7; run++) {
    let start = performance.now();
    services.update();
    coverage.push(performance.now() - start);
    const citizens = new CitizenSystem(s);
    start = performance.now();
    citizens.reconcile();
    schools.push(performance.now() - start);
  }
  const summarize = (values: number[]) => ({
    firstMs: values[0],
    samples: values.slice(2),
    meanMs: values.slice(2).reduce((a, b) => a + b, 0) / 5,
  });
  const stateSha256 = createHash('sha256')
    .update(JSON.stringify(s))
    .digest('hex');
  s.clock.ticks = hourTicks(5);
  s.clock.day = Math.floor(s.clock.ticks / 10);
  s.clock.tickInDay = s.clock.ticks % 10;
  const buildingEvents: SimEvent[] = [];
  const sim = new Simulation(
    s.settings,
    (event) => {
      if (event.t === 'buildingsChanged') buildingEvents.push(event);
    },
    s,
  );
  buildingEvents.length = 0;
  sim.setSpeed(1);
  const ticks: number[] = [],
    daily: number[] = [];
  let settled: boolean;
  sim.onDay(() => {
    settled = true;
  });
  for (let i = 0; i < 60; i++) {
    settled = false;
    const start = performance.now();
    sim.tick();
    const ms = performance.now() - start;
    ticks.push(ms);
    if (settled) daily.push(ms);
  }
  const summary = (values: number[]) => ({
    samples: values,
    meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    maxMs: Math.max(...values),
    p95Ms: [...values].sort((a, b) => a - b)[
      Math.ceil(values.length * 0.95) - 1
    ],
  });
  const snapshot = sim.snapshot();
  const report = {
    population: s.citizens.count,
    schools: 96,
    enrolled: s.citizens.schoolId
      .slice(0, s.citizens.count)
      .filter((id) => id !== 0).length,
    coverage: summarize(coverage),
    reconcile: summarize(schools),
    stateSha256,
    populationEnd: snapshot.stats.population,
    tick: summary(ticks),
    daily: summary(daily),
    buildingEventsSha256: createHash('sha256')
      .update(JSON.stringify(buildingEvents))
      .digest('hex'),
    buildingEventCount: buildingEvents.length,
    simulationSha256: createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex'),
    note: 'Authored 100k fixture plus 96 schools; 32 disconnected roads; Coverage and reconcile measured separately (first run retained, mean of runs 3–7); then full Simulation.tick at 05:00 for 60 ticks / 6 day boundaries. Sink retains building events for hashing outside timing; excludes browser IPC/GPU. Reconcile includes household/job summaries, not only schools.',
  };
  expect(report.population).toBe(100000);
  expect(report.enrolled).toBeGreaterThan(0);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/services-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
}, 120000);
