import { ROADS } from '../data/roads';
import { TRAFFIC } from '../data/simulation';
import { TrafficKind } from '../data/traffic';
import type { RoadSegment } from './types';
import type { TrafficState } from './traffic';
export interface RoadTraffic {
  id: number;
  ratio: number;
  count: number;
  speedKmh: number;
}
export interface RoadTrafficSample {
  segment: number;
  kind: number;
  speed: number;
}
/** Current non-pedestrian occupancy, not vehicles/hour. Empty roads are uncongested. */
export function summarizeRoadTraffic(
  roads: readonly RoadSegment[],
  samples: Iterable<RoadTrafficSample>,
): RoadTraffic[] {
  const sums = new Map<number, { speed: number; count: number }>();
  for (const v of samples) {
    if (!v.segment || v.kind === TrafficKind.pedestrian) continue;
    const sum = sums.get(v.segment) ?? { speed: 0, count: 0 };
    sum.speed += Math.max(0, v.speed) * 3.6;
    sum.count++;
    sums.set(v.segment, sum);
  }
  return roads.map((s) => {
    const sum = sums.get(s.id),
      speedKmh = sum ? sum.speed / sum.count : ROADS[s.type].speedKph;
    return {
      id: s.id,
      count: sum?.count ?? 0,
      speedKmh,
      ratio: Math.min(1, speedKmh / ROADS[s.type].speedKph),
    };
  });
}
export function savedRoadTraffic(
  roads: readonly RoadSegment[],
  state: TrafficState,
): RoadTraffic[] {
  return summarizeRoadTraffic(
    roads,
    state.vehicles.map((v) => ({
      segment: state.routes[v.route]?.legs[v.leg]?.segment ?? 0,
      kind: v.kind,
      speed: v.speed,
    })),
  );
}
export function roadTrafficBand(ratio: number): 'good' | 'slow' | 'blocked' {
  return ratio < TRAFFIC.badFlowBelow
    ? 'blocked'
    : ratio > TRAFFIC.goodFlowAbove
      ? 'good'
      : 'slow';
}
