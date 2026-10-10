import { SCHEDULES } from '../data/schedules';
import { CITIZENS } from '../data/simulation';
export const JourneyPurpose = {
  none: 0,
  work: 1,
  school: 2,
  home: 3,
  shopping: 4,
  leisure: 5,
} as const;
export const JourneyStatus = {
  none: 0,
  pending: 1,
  moving: 2,
  blocked: 3,
} as const;
export const TravelMode = { walk: 0, drive: 1 } as const;
export interface Journey {
  citizenId: number;
  originId: number;
  destinationId: number;
  purpose: number;
  mode: number;
  requestedTick: number;
}
export function mobilityHour(ticks: number): number {
  return (
    ((ticks % SCHEDULES.ticksPerDay) / SCHEDULES.ticksPerDay) *
    SCHEDULES.hoursPerDay
  );
}
export function mobilityDay(ticks: number): number {
  return Math.floor(ticks / SCHEDULES.ticksPerDay);
}
export function hourTicks(hours: number): number {
  return Math.round((hours / SCHEDULES.hoursPerDay) * SCHEDULES.ticksPerDay);
}
/** Visibility sampling only: never combines residents with different origins or destinations. */
export function representativeCitizen(
  id: number,
  device: keyof typeof CITIZENS.agentScale,
): boolean {
  return id % CITIZENS.agentScale[device] === 0;
}
