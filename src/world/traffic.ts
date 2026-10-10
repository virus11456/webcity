import type { Journey } from './schedules';
import type { Route, RouteLeg } from './routes';
import type { LanePoint } from './roadLanes';
export interface SavedRoute {
  mode: Route['mode'];
  legs: (Omit<RouteLeg, 'points'> & { points?: LanePoint[] })[];
}
export interface SavedVehicle {
  id: number;
  journey: Journey;
  kind: number;
  route: number;
  leg: number;
  distance: number;
  speed: number;
  stopped: number;
  stopWait: number;
  reservedNode: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}
export interface StrandedJourney {
  journey: Journey;
  x: number;
  y: number;
  z: number;
  lane: string;
  laneDistance: number;
}
export interface TrafficState {
  version: 1;
  nextId: number;
  nextMissionId: number;
  seconds: number;
  arrived: number;
  removedStuck: number;
  routes: SavedRoute[];
  vehicles: SavedVehicle[];
  stranded: StrandedJourney[];
}
export function emptyTraffic(): TrafficState {
  return {
    version: 1,
    nextId: 1,
    nextMissionId: 1,
    seconds: 0,
    arrived: 0,
    removedStuck: 0,
    routes: [],
    vehicles: [],
    stranded: [],
  };
}
/** Geometry stays in road graphs; only uncommon access/lane-change samples need saving. */
export function saveRoute(route: Route): SavedRoute {
  return {
    mode: route.mode,
    legs: route.legs.map((leg) => {
      const { points, ...data } = leg;
      return leg.kind === 'access' || leg.kind === 'laneChange'
        ? { ...data, points: points.map((p) => ({ ...p })) }
        : data;
    }),
  };
}

export interface TrafficInfo {
  bus?: { line: number; passengers: number };
  id: number;
  citizenId: number;
  kind: number;
  homeId: number;
  workId: number;
  destinationId: number;
  originId?: number;
  originPos?: { x: number; z: number };
  cargo?: { units: number; kind: 'local' | 'import' | 'export' };
  purpose: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  homePos?: { x: number; z: number };
  workPos?: { x: number; z: number };
  destinationPos?: { x: number; z: number };
}
