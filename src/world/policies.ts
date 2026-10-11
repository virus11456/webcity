import {
  POLICIES,
  type PolicyId,
  type PolicyDefinition,
} from '../data/policies';
import { TRANSIT } from '../data/transit';
import { UTILITY_RULES } from '../data/buildings';
import { districtAt, type District } from './districts';
import type { Building, Vec2, RoadNode, RoadSegment } from './types';
import { sampleRoad } from './roadProfile';
export interface PolicyWorld {
  policies: readonly PolicyId[];
  districts: readonly District[];
}
const definitions: readonly PolicyDefinition[] = POLICIES;
export function hasPolicy(s: PolicyWorld, id: PolicyId, pos: Vec2): boolean {
  const district = s.districts.find(
    (d) => d.id === districtAt(s.districts, pos),
  );
  return district?.policies?.[id] ?? s.policies.includes(id);
}
export function policyValue(
  s: PolicyWorld,
  pos: Vec2,
  key: keyof PolicyDefinition['effects'],
  fallback: number,
): number {
  let value = fallback;
  for (const p of definitions) {
    const v = p.effects[key];
    if (typeof v === 'number' && hasPolicy(s, p.id as PolicyId, pos))
      value = key === 'happinessDelta' ? value + v : v;
  }
  return value;
}
export function policyFee(
  s: PolicyWorld,
  buildings: readonly Building[],
): number {
  return buildings.reduce(
    (sum, b) =>
      sum +
      (b.state === 'active'
        ? (b.housing?.occupied ?? 0) *
          definitions.reduce(
            (n, p) =>
              n +
              (hasPolicy(s, p.id as PolicyId, b.pos)
                ? p.costPerHouseholdWeek
                : 0),
            0,
          )
        : 0),
    0,
  );
}
export function garbageRate(s: PolicyWorld, b: Building): number {
  return b.kind !== 'zoned' || b.state !== 'active'
    ? 0
    : ((b.housing?.occupied ?? 0) * UTILITY_RULES.garbagePerDay.household +
        b.jobs * UTILITY_RULES.garbagePerDay.job) *
        policyValue(s, b.pos, 'garbageMultiplier', 1);
}
export function busChoiceProbability(s: PolicyWorld, pos: Vec2): number {
  return Math.min(
    1,
    TRANSIT.baseChoiceProbability *
      policyValue(s, pos, 'busRidershipMultiplier', 1),
  );
}
export function wantsBus(s: PolicyWorld, pos: Vec2, citizen: number): boolean {
  return (
    ((Math.imul(citizen, 2654435761) >>> 0) % 10000) / 10000 <
    busChoiceProbability(s, pos)
  );
}
/** Whole local road sections touching a prohibited district are excluded; highways remain through routes. */
export function truckBannedRoads(
  s: PolicyWorld,
  nodes: readonly RoadNode[],
  roads: readonly RoadSegment[],
): Set<number> {
  const result = new Set<number>();
  if (
    !s.policies.includes('heavy_vehicle_ban') &&
    !s.districts.some((d) => d.policies?.heavy_vehicle_ban)
  )
    return result;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const r of roads) {
    if (r.type === 'highway' || r.regional) continue;
    const a = byId.get(r.start),
      b = byId.get(r.end);
    if (
      a &&
      b &&
      sampleRoad(r, a, b).some((p) => hasPolicy(s, 'heavy_vehicle_ban', p))
    )
      result.add(r.id);
  }
  return result;
}
