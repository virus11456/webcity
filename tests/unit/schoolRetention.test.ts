import { expect, it } from 'vitest';
import { reserveSchoolPlaces } from '../../src/sim/schoolRetention';
import { schoolRetentionFixture } from '../fixtures/schoolRetention';
it.each([false, true])(
  'matches the original reservation algorithm including remaining seats (interleaved=%s)',
  (interleaved) => {
    const actual = schoolRetentionFixture(interleaved, 3000);
    const expected = schoolRetentionFixture(interleaved, 3000);
    const slots = actual.slots(),
      referenceSlots = expected.slots();
    for (const id of slots.keys()) {
      slots.set(id, 3);
      referenceSlots.set(id, 3);
    }
    for (const i of expected.eligible) {
      const old = expected.c.schoolId[i]!;
      if (
        (referenceSlots.get(old) ?? 0) > 0 &&
        Number.isFinite(expected.distance(i, old))
      )
        referenceSlots.set(old, referenceSlots.get(old)! - 1);
      else expected.c.schoolId[i] = 0;
    }
    reserveSchoolPlaces(actual.c, actual.eligible, slots, actual.distance);
    expect(actual.c).toEqual(expected.c);
    expect([...slots]).toEqual([...referenceSlots]);
  },
);
