import type { LanePoint } from './roadLanes';
export interface RouteLeg {
  id: string;
  kind: 'lane' | 'junction' | 'laneChange' | 'walk' | 'access';
  segment: number;
  node?: number;
  lane?: string;
  fromLane?: string;
  toLane?: string;
  length: number;
  startDistance?: number;
  fromLaneDistance?: number;
  toLaneDistance?: number;
  speedMps: number;
  points: readonly LanePoint[];
}
export interface Route {
  revision: number;
  mode: 'drive' | 'walk';
  legs: readonly RouteLeg[];
  length: number;
  costSeconds: number;
}
