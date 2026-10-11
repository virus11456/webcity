import { SCHEDULES } from '../../data/schedules';
import { CITIZENS } from '../../data/simulation';
import { CitizenState } from '../../world/citizens';
import {
  hourTicks,
  mobilityDay,
  mobilityHour,
  JourneyPurpose as Purpose,
  JourneyStatus as Status,
  TravelMode,
  type Journey,
} from '../../world/schedules';
import type { Building } from '../../world/types';
import type { SimState } from '../state';
import { citizenSystem } from './citizens';

/** A destination request is not arrival. Only the movement system may acknowledge arrival. */
export class ScheduleSystem {
  private cursor = 0;
  private readonly buildings = new Map<number, Building>();
  constructor(private readonly s: SimState) {
    this.refreshBuildings();
  }
  private refreshBuildings(): void {
    if (
      this.buildings.size !== this.s.buildings.length ||
      this.s.buildings.some((b) => this.buildings.get(b.id) !== b)
    ) {
      this.buildings.clear();
      for (const b of this.s.buildings) this.buildings.set(b.id, b);
    }
  }
  private request(i: number, destination: number, purpose: number): void {
    const c = this.s.citizens,
      origin = this.buildings.get(c.locationId[i]!),
      target = this.buildings.get(destination);
    if (!target || target.state !== 'active') return;
    c.restAfterTrip[i] =
      purpose === Purpose.home &&
      (c.state[i] === CitizenState.working ||
        c.state[i] === CitizenState.school)
        ? 1
        : 0;
    c.destinationId[i] = destination;
    c.tripOriginId[i] = c.locationId[i]!;
    c.tripStartTick[i] = this.s.clock.ticks;
    c.tripPurpose[i] = purpose;
    c.travelMode[i] =
      origin &&
      Math.hypot(origin.pos.x - target.pos.x, origin.pos.z - target.pos.z) <
        CITIZENS.walkDistanceBelowM
        ? TravelMode.walk
        : TravelMode.drive;
    c.tripStatus[i] = Status.pending;
    c.state[i] = CitizenState.commuting;
  }
  private optionalDestination(i: number, leisure: boolean): number {
    const c = this.s.citizens,
      origin = this.buildings.get(c.locationId[i]!);
    if (!origin) return 0;
    let best: number = SCHEDULES.optionalSearchRadiusM,
      result = 0;
    for (const b of this.buildings.values()) {
      if (
        b.state !== 'active' ||
        b.id === origin.id ||
        b.roadDisconnectedDay !== undefined
      )
        continue;
      if (
        !(leisure && (b.kind === 'park' || b.kind === 'unique')) &&
        !['CL', 'CH'].includes(b.defId)
      )
        continue;
      const distance = Math.hypot(
        b.pos.x - origin.pos.x,
        b.pos.z - origin.pos.z,
      );
      if (distance < best || (distance === best && b.id < result)) {
        best = distance;
        result = b.id;
      }
    }
    return result;
  }
  tick(): void {
    const s = this.s,
      c = s.citizens,
      tick = s.clock.ticks;
    this.refreshBuildings();
    const day = mobilityDay(tick),
      hour = mobilityHour(tick);
    for (let i = 0; i < c.count; i++) {
      if (!c.locationId[i]) c.locationId[i] = c.homeId[i]!;
      if (c.tripStatus[i] !== Status.none) continue; // Never reset a trip at midnight or fiscal-day boundaries.
      if (c.activityUntilTick[i]! > tick) continue;
      if (c.locationId[i] !== c.homeId[i]) {
        this.request(i, c.homeId[i]!, Purpose.home);
        continue;
      }
      const destination = c.schoolId[i] || c.workId[i]!;
      const start =
        SCHEDULES.shiftStartHours[c.schoolId[i] ? 0 : c.shiftId[i]!]! +
        ((c.id[i]! % 101) / 101) * SCHEDULES.departureSpreadHours;
      const cycle = Math.floor(
        (tick - hourTicks(start)) / SCHEDULES.ticksPerDay,
      );
      const departure = cycle * SCHEDULES.ticksPerDay + hourTicks(start);
      // A missed shift can start within this shift's interval; overnight shifts keep their own cycle.
      if (
        destination &&
        cycle >= 0 &&
        c.lastShiftCycle[i]! < cycle + 1 &&
        tick < departure + hourTicks(SCHEDULES.shiftDurationHours)
      ) {
        c.lastShiftCycle[i] = cycle + 1;
        c.shiftEndTick[i] = departure + hourTicks(SCHEDULES.shiftDurationHours);
        this.request(
          i,
          destination,
          c.schoolId[i] ? Purpose.school : Purpose.work,
        );
        continue;
      }
      const shopping =
        hour >= CITIZENS.schedule.shoppingHours[0] &&
        hour < CITIZENS.schedule.shoppingHours[1];
      const leisure =
        hour >= CITIZENS.schedule.leisureHours[0] &&
        hour < CITIZENS.schedule.leisureHours[1];
      const key = shopping ? 'lastShoppingCycle' : 'lastLeisureCycle';
      if ((shopping || leisure) && c[key][i]! < day + 1) {
        c[key][i] = day + 1;
        const chance = shopping
          ? CITIZENS.schedule.shoppingChance
          : CITIZENS.schedule.leisureChance;
        // Stable per-person, per-day chance without consuming lifetime RNG.
        const roll =
          ((Math.imul(c.id[i]!, 1664525) ^ Math.imul(day + 1, 1013904223)) >>>
            0) /
          4294967296;
        if (roll < chance) {
          const target = this.optionalDestination(i, leisure);
          if (target) {
            this.request(
              i,
              target,
              shopping ? Purpose.shopping : Purpose.leisure,
            );
            continue;
          }
        }
      }
      c.state[i] =
        hour < SCHEDULES.sleepStartEndHours[1] ||
        hour >= SCHEDULES.sleepStartEndHours[0]
          ? CitizenState.sleeping
          : CitizenState.home;
    }
  }
  /** Bounded queue scan; all agents retain their own requests regardless of visibility sampling. */
  pending(limit: number): Journey[] {
    const c = this.s.citizens,
      result: Journey[] = [];
    for (
      let scanned = 0;
      scanned < c.count && result.length < limit;
      scanned++
    ) {
      const i = this.cursor++ % c.count;
      if (
        c.tripStatus[i] !== Status.pending &&
        !(
          c.tripStatus[i] === Status.blocked &&
          this.s.clock.ticks - c.tripStartTick[i]! >= SCHEDULES.retryTicks
        )
      )
        continue;
      result.push({
        citizenId: c.id[i]!,
        originId: c.tripOriginId[i]!,
        destinationId: c.destinationId[i]!,
        purpose: c.tripPurpose[i]!,
        mode: c.travelMode[i]!,
        requestedTick: c.tripStartTick[i]!,
      });
    }
    return result;
  }
  /** Ignore stale results for a removed/replaced citizen or a newer trip. */
  private row(j: Journey): number | undefined {
    const i = citizenSystem(this.s).indexOf(j.citizenId),
      c = this.s.citizens;
    return i !== undefined &&
      c.tripStatus[i] !== Status.none &&
      c.tripStartTick[i] === j.requestedTick &&
      c.destinationId[i] === j.destinationId
      ? i
      : undefined;
  }
  hasDestination(j: Journey): boolean {
    return this.buildings.get(j.destinationId)?.state === 'active';
  }
  /** Change intent, never location: the traffic system retains the actual stranded position. */
  returnHome(j: Journey): Journey {
    const i = this.row(j),
      c = this.s.citizens;
    if (i === undefined) return j;
    c.destinationId[i] = c.homeId[i]!;
    c.tripPurpose[i] = Purpose.home;
    c.restAfterTrip[i] = 1;
    c.tripStatus[i] = Status.blocked;
    c.tripStartTick[i] = this.s.clock.ticks;
    return {
      ...j,
      destinationId: c.homeId[i]!,
      purpose: Purpose.home,
      requestedTick: this.s.clock.ticks,
    };
  }
  depart(j: Journey): boolean {
    const i = this.row(j);
    if (i === undefined || this.s.citizens.tripStatus[i] === Status.moving)
      return false;
    this.s.citizens.tripStatus[i] = Status.moving;
    return true;
  }
  blocked(j: Journey): void {
    const i = this.row(j);
    if (i !== undefined) {
      this.s.citizens.tripStatus[i] = Status.blocked;
      this.s.citizens.tripStartTick[i] = this.s.clock.ticks;
    }
  }
  arrive(j: Journey): boolean {
    const i = this.row(j);
    if (i === undefined) return false;
    const c = this.s.citizens;
    if (
      c.tripStatus[i] !== Status.moving ||
      this.buildings.get(j.destinationId)?.state !== 'active'
    )
      return false;
    const tick = this.s.clock.ticks;
    c.locationId[i] = j.destinationId;
    c.destinationId[i] = 0;
    c.tripStatus[i] = Status.none;
    if (j.purpose === Purpose.home) {
      c.state[i] = c.restAfterTrip[i]
        ? CitizenState.sleeping
        : CitizenState.home;
      c.activityUntilTick[i] =
        tick + (c.restAfterTrip[i] ? hourTicks(SCHEDULES.sleepHours) : 0);
    } else if (j.purpose === Purpose.work || j.purpose === Purpose.school) {
      c.state[i] =
        j.purpose === Purpose.work ? CitizenState.working : CitizenState.school;
      c.activityUntilTick[i] = Math.max(
        c.shiftEndTick[i]!,
        tick + hourTicks(SCHEDULES.minimumStayHours),
      );
    } else {
      c.state[i] =
        j.purpose === Purpose.shopping
          ? CitizenState.shopping
          : CitizenState.leisure;
      c.activityUntilTick[i] =
        tick +
        hourTicks(
          j.purpose === Purpose.shopping
            ? SCHEDULES.shoppingStayHours
            : SCHEDULES.leisureStayHours,
        );
    }
    c.tripPurpose[i] = Purpose.none;
    return true;
  }
}
