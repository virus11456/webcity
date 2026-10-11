import { test, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { garbageState } from '../fixtures/garbageCity';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { GarbageSystem } from '../../src/sim/systems/garbage';
import { DeathcareSystem } from '../../src/sim/systems/deathcare';

test('measure collection dispatch with many targets and operational depots', () => {
  const { s } = garbageState();
  const facility = s.buildings[0]!,
    home = s.buildings[1]!;
  s.buildings = [];
  for (let i = 0; i < 32; i++) {
    for (const defId of ['garbage_landfill', 'cemetery'])
      s.buildings.push({
        ...structuredClone(facility),
        id: s.nextId++,
        defId,
        pos: { x: -350 + i * 20, z: 9 },
      });
  }
  for (let i = 0; i < 2000; i++)
    s.buildings.push({
      ...structuredClone(home),
      id: s.nextId++,
      pos: { x: -340 + (i % 100) * 6, z: 9 },
      bodies: { pending: 3 },
    });
  const lanes = new LaneGraph();
  lanes.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, lanes, schedules),
    traffic = new TrafficSystem(s, lanes, planner, schedules),
    garbage = new GarbageSystem(s, planner, traffic),
    deathcare = new DeathcareSystem(s, planner, traffic);
  const samples: number[] = [];
  for (let i = 0; i < 40; i++) {
    s.clock.ticks++;
    // Measure only dispatch; movement is real but outside the timed interval.
    traffic.step(0.24);
    const start = performance.now();
    garbage.tick();
    deathcare.tick();
    samples.push(performance.now() - start);
  }
  expect(s.garbage.missions.length).toBeGreaterThan(0);
  expect(s.deathcare.missions.length).toBeGreaterThan(0);
  const report = {
    targets: 2000,
    garbageDepots: 32,
    deathcareDepots: 32,
    samples,
    meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
    maxMs: Math.max(...samples),
    garbageMissions: s.garbage.missions.length,
    deathcareMissions: s.deathcare.missions.length,
    stateSha256: createHash('sha256')
      .update(JSON.stringify({ ...s, traffic: traffic.snapshot() }))
      .digest('hex'),
    note: 'Synthetic shared-road dispatch workload, 40 ticks; traffic movement occurs outside dispatch timing; not a full population simulation or a 30ms gate.',
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/dispatch-performance.json',
    JSON.stringify(report, null, 2),
  );
}, 120000);
