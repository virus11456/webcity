import type { Journey } from './schedules';
import type { Vec2 } from './types';
export interface BusPassenger {
  journey: Journey;
  from: number;
  to: number;
  stage: 'access' | 'waiting' | 'riding' | 'egress';
  mission: number;
  bus: number;
  since: number;
  position: Vec2;
}
export interface BusRun {
  id: number;
  target: number;
  mission: number;
  position: Vec2;
}
export interface BusLine {
  mode?: 'metro';
  stationIds?: number[];
  id: number;
  depot: number;
  color: number;
  stops: Vec2[];
  length: number;
  vehicles: number;
  blocked: boolean;
  week: number;
  passengers: number;
  revenue: number;
  lastPassengers: number;
  lastRevenue: number;
  buses: BusRun[];
  riders: BusPassenger[];
}
export type BusLineView = Omit<BusLine, 'buses' | 'riders'> & {
  running: number;
  waiting: number;
  onboard: number;
};

export function busLineViews(lines: readonly BusLine[]): BusLineView[] {
  return lines.map(({ buses, riders, ...line }) => ({
    ...structuredClone(line),
    running: buses.length,
    waiting: riders.filter((p) => p.stage === 'waiting' || p.stage === 'access')
      .length,
    onboard: riders.filter((p) => p.stage === 'riding').length,
  }));
}
