import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performanceCity } from '../fixtures/performanceCity';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { hourTicks } from '../../src/world/schedules';
import {
  CITIZEN_INT_FIELDS,
  CITIZEN_BYTE_FIELDS,
} from '../../src/world/citizens';

test('measure 100k mixed-shift scheduling at morning, afternoon and overnight boundaries', () => {
  const s = performanceCity(),
    c = s.citizens;
  const school = {
    ...structuredClone(s.buildings[0]!),
    id: s.nextId++,
    kind: 'service' as const,
    defId: 'school_elementary',
  };
  s.buildings.push(school);
  for (let i = 0; i < c.count; i++) if (i % 5 === 0) c.schoolId[i] = school.id;
  const scheduler = new ScheduleSystem(s);
  const hours = [0, 5.99, 6, 7.5, 9, 14, 16, 22, 23.99, 24, 25, 32];
  const samples: number[] = [],
    hashes: string[] = [];
  for (let run = 0; run < 7; run++) {
    let elapsed = 0;
    const hash = createHash('sha256');
    for (const hour of hours) {
      s.clock.ticks = hourTicks(hour);
      c.tripStatus.fill(0);
      c.tripPurpose.fill(0);
      c.tripOriginId.fill(0);
      c.tripStartTick.fill(0);
      c.destinationId.fill(0);
      c.travelMode.fill(0);
      c.restAfterTrip.fill(0);
      c.shiftEndTick.fill(0);
      c.activityUntilTick.fill(0);
      c.lastShiftCycle.fill(0);
      c.lastShoppingCycle.fill(0);
      c.lastLeisureCycle.fill(0);
      c.state.fill(0);
      c.locationId.set(c.homeId);
      const start = performance.now();
      scheduler.tick();
      elapsed += performance.now() - start;
      for (const key of [...CITIZEN_INT_FIELDS, ...CITIZEN_BYTE_FIELDS])
        hash.update(
          new Uint8Array(
            c[key].buffer,
            c[key].byteOffset,
            c.count * c[key].BYTES_PER_ELEMENT,
          ),
        );
    }
    samples.push(elapsed / hours.length);
    hashes.push(hash.digest('hex'));
  }
  expect(new Set(hashes).size).toBe(1);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/shift-schedule-performance.json',
    JSON.stringify(
      {
        residents: c.count,
        hours,
        samples,
        meanMs: samples.slice(2).reduce((a, b) => a + b, 0) / 5,
        resultSha256: hashes[0],
        note: 'Authored 100k residents with mixed jobs and 20k designated pupils; 12 independent request bursts per run, seven runs. Mean per scheduling tick, runs 3–7. Resetting and hashing every citizen column excluded from timer; no traffic movement, IPC or GPU. Full simulation measured separately.',
      },
      null,
      2,
    ) + '\n',
  );
}, 120000);
