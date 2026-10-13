import { createHash } from 'node:crypto';
import { reserveSchoolPlaces } from '../../src/sim/schoolRetention';
import { schoolRetentionFixture } from './schoolRetention';
export function measureSchoolRetention() {
  return [false, true].map((interleaved) => {
    const fixture = schoolRetentionFixture(interleaved),
      initial = fixture.c.schoolId.slice();
    const samples: number[] = [],
      hashes: string[] = [];
    for (let run = 0; run < 9; run++) {
      fixture.c.schoolId.set(initial);
      const slots = fixture.slots();
      const start = performance.now();
      reserveSchoolPlaces(fixture.c, fixture.eligible, slots, fixture.distance);
      samples.push(performance.now() - start);
      hashes.push(
        createHash('sha256')
          .update(new Uint8Array(fixture.c.schoolId.buffer))
          .update(JSON.stringify([...slots]))
          .digest('hex'),
      );
    }
    return {
      interleaved,
      pupils: fixture.c.count,
      samples,
      meanMs: samples.slice(2).reduce((a, b) => a + b, 0) / 7,
      hashes,
      note: 'Existing pupil reservation only. Nine runs, mean of runs 3–9; excludes fixture, reset and hashes. 1000 homes, 96 schools, two disconnected roads, 750 seats per school and 600m radius; grouped and interleaved IDs measured separately.',
    };
  });
}
