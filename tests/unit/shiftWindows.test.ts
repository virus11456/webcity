import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { createCitizens, CitizenState } from '../../src/world/citizens';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { SCHEDULES } from '../../src/data/schedules';
import {
  hourTicks,
  JourneyStatus,
  JourneyPurpose,
} from '../../src/world/schedules';

function fixture(count = 1) {
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: 'Shift windows',
  });
  const base = districtFixture(1)[0]!;
  s.buildings = [
    { ...base, id: 1, defId: 'RH', state: 'active', pos: { x: 0, z: 0 } },
    { ...base, id: 2, defId: 'I', state: 'active', pos: { x: 800, z: 0 } },
    {
      ...base,
      id: 3,
      defId: 'school_elementary',
      kind: 'service',
      state: 'active',
      pos: { x: 100, z: 0 },
    },
  ];
  const c = (s.citizens = createCitizens(count));
  c.count = count;
  c.homeId.fill(1);
  c.locationId.fill(1);
  c.workId.fill(2);
  return { s, c, system: new ScheduleSystem(s) };
}
function reset(c: ReturnType<typeof fixture>['c']) {
  c.tripStatus.fill(JourneyStatus.none);
  c.destinationId.fill(0);
  c.locationId.set(c.homeId);
  c.activityUntilTick.fill(0);
  c.lastShiftCycle.fill(0);
  c.shiftEndTick.fill(0);
}
// Original per-person formula: intentionally independent of the shared-window implementation.
function windowAt(id: number, shift: number, school: boolean, tick: number) {
  const start =
    SCHEDULES.shiftStartHours[school ? 0 : shift]! +
    ((id % 101) / 101) * SCHEDULES.departureSpreadHours;
  const cycle = Math.floor((tick - hourTicks(start)) / SCHEDULES.ticksPerDay);
  return {
    cycle,
    end:
      cycle * SCHEDULES.ticksPerDay +
      hourTicks(start) +
      hourTicks(SCHEDULES.shiftDurationHours),
  };
}
describe('exact shared shift windows', () => {
  it.each([0, 1, 2])(
    'preserves all 101 departure offsets and window edges for worker shift %i',
    (shift) => {
      const { s, c, system } = fixture();
      c.shiftId[0] = shift;
      for (let offset = 0; offset < 101; offset++) {
        c.id[0] = 101 + offset;
        const start = hourTicks(
          SCHEDULES.shiftStartHours[shift]! +
            (offset / 101) * SCHEDULES.departureSpreadHours,
        );
        const end = start + hourTicks(SCHEDULES.shiftDurationHours);
        for (const tick of [
          start - 1,
          start,
          end - 1,
          end,
          start + SCHEDULES.ticksPerDay,
        ]) {
          reset(c);
          s.clock.ticks = tick;
          const expected = windowAt(c.id[0]!, shift, false, tick);
          const leaves = expected.cycle >= 0 && tick < expected.end;
          system.tick();
          expect(c.tripStatus[0]).toBe(
            leaves ? JourneyStatus.pending : JourneyStatus.none,
          );
          expect(c.lastShiftCycle[0]).toBe(leaves ? expected.cycle + 1 : 0);
          expect(c.shiftEndTick[0]).toBe(leaves ? expected.end : 0);
          if (leaves) expect(c.tripPurpose[0]).toBe(JourneyPurpose.work);
        }
      }
    },
  );
  it.each([0, 1, 2])(
    'uses the school morning window despite stored shift %i',
    (shift) => {
      const { s, c, system } = fixture();
      c.shiftId[0] = shift;
      c.schoolId[0] = 3;
      for (let offset = 0; offset < 101; offset++) {
        c.id[0] = 202 + offset;
        const start = hourTicks(6 + (offset / 101) * 3);
        for (const tick of [start - 1, start, start + hourTicks(10)]) {
          reset(c);
          s.clock.ticks = tick;
          const expected = windowAt(c.id[0]!, shift, true, tick);
          const leaves = expected.cycle >= 0 && tick < expected.end;
          system.tick();
          expect(c.destinationId[0]).toBe(leaves ? 3 : 0);
          expect(c.shiftEndTick[0]).toBe(leaves ? expected.end : 0);
          if (leaves) expect(c.tripPurpose[0]).toBe(JourneyPurpose.school);
        }
      }
    },
  );
  it('does not repeat a consumed shift, interrupt travel, or wake a resting resident', () => {
    const { s, c, system } = fixture(4);
    c.id.set([101, 202, 303, 404]);
    c.lastShiftCycle[0] = 1;
    c.tripStatus[1] = JourneyStatus.moving;
    c.tripStatus[2] = JourneyStatus.blocked;
    c.activityUntilTick[3] = hourTicks(12);
    c.state[3] = CitizenState.sleeping;
    s.clock.ticks = hourTicks(8);
    system.tick();
    expect([...c.tripStatus]).toEqual([
      JourneyStatus.none,
      JourneyStatus.moving,
      JourneyStatus.blocked,
      JourneyStatus.none,
    ]);
    expect([...c.destinationId]).toEqual([0, 0, 0, 0]);
    expect(c.state[3]).toBe(CitizenState.sleeping);
  });
  it('recomputes after backward/forward clock jumps and assignment changes without persisting windows', () => {
    const { s, c, system } = fixture();
    c.id[0] = 2147483600;
    for (const [tick, shift, school] of [
      [hourTicks(200), 2, 0],
      [hourTicks(6), 2, 3],
      [hourTicks(49), 2, 0],
      [0, 1, 0],
      [hourTicks(80), 0, 0],
    ]) {
      reset(c);
      s.clock.ticks = tick!;
      c.shiftId[0] = shift!;
      c.schoolId[0] = school!;
      const expected = windowAt(c.id[0]!, shift!, !!school, tick!);
      const leaves = expected.cycle >= 0 && tick! < expected.end;
      system.tick();
      expect(c.destinationId[0]).toBe(leaves ? school || 2 : 0);
      expect(c.shiftEndTick[0]).toBe(leaves ? expected.end : 0);
    }
  });
  it('keeps mixed shift/offset groups and unemployed residents independent', () => {
    const { s, c, system } = fixture(707);
    for (let i = 0; i < c.count; i++) {
      c.id[i] = 10000 + i;
      c.shiftId[i] = i % 3;
      if (i % 5 === 0) c.schoolId[i] = 3;
      else if (i % 7 === 0) c.workId[i] = 0;
    }
    s.clock.ticks = hourTicks(25);
    system.tick();
    for (let i = 0; i < c.count; i++) {
      const expected = windowAt(
        c.id[i]!,
        c.shiftId[i]!,
        !!c.schoolId[i],
        s.clock.ticks,
      );
      const destination = c.schoolId[i] || c.workId[i]!;
      const leaves =
        destination && expected.cycle >= 0 && s.clock.ticks < expected.end;
      expect(c.destinationId[i]).toBe(leaves ? destination : 0);
      expect(c.lastShiftCycle[i]).toBe(leaves ? expected.cycle + 1 : 0);
    }
  });
});
