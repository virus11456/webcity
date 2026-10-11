import { policyValue } from '../../world/policies';
import { fieldIndex } from '../../world/fieldSampling';
import { WATER_UTILITY as W } from '../../data/waterUtility';
import { POWER } from '../../data/power';
import { UTILITY_RULES } from '../../data/buildings';
import { distance } from '../../core/math';
import { shapeDistance } from '../../world/power';
import { waterDefinition, intakePoint } from '../../world/waterUtility';
import { polygonBounds, zoneBuildingFootprint } from '../../world/zoneGeometry';
import type { Building } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
function demand(b: Building): number {
  if (b.kind !== 'zoned') return 0;
  return b.defId === 'RL' || b.defId === 'RH'
    ? (b.housing?.occupied ?? b.households) *
        UTILITY_RULES.waterM3PerWeek.household
    : b.jobs * UTILITY_RULES.waterM3PerWeek.job;
}
/** Pipes form physical islands; buildings attach within 48m but never relay or join pipe islands. */
export function updateWater(s: SimState): BuildingPatch[] {
  const pipes = s.networks.water,
    links = pipes.map(() => [] as number[]),
    buckets = new Map<string, number[]>();
  const keys = (points: readonly { x: number; z: number }[], reach: number) => {
    const b = polygonBounds(points),
      result: string[] = [];
    for (
      let z = Math.floor((b.minZ - reach) / W.graphCellM);
      z <= Math.floor((b.maxZ + reach) / W.graphCellM);
      z++
    )
      for (
        let x = Math.floor((b.minX - reach) / W.graphCellM);
        x <= Math.floor((b.maxX + reach) / W.graphCellM);
        x++
      )
        result.push(`${x},${z}`);
    return result;
  };
  pipes.forEach((p, i) => {
    const cells = keys(p.points, W.pipeJoinM),
      seen = new Set<number>();
    for (const k of cells) {
      for (const j of buckets.get(k) ?? [])
        if (!seen.has(j)) {
          seen.add(j);
          if (
            shapeDistance(p.points, false, pipes[j]!.points, false) <=
            W.pipeJoinM + POWER.epsilon
          ) {
            links[i]!.push(j);
            links[j]!.push(i);
          }
        }
    }
    for (const k of cells) {
      const list = buckets.get(k) ?? [];
      list.push(i);
      buckets.set(k, list);
    }
  });
  const groupFor = new Map<number, number>(),
    groups: Building[][] = [];
  pipes.forEach((_, i) => {
    if (groupFor.has(i)) return;
    const id = groups.length,
      queue = [i];
    groups.push([]);
    groupFor.set(i, id);
    for (let head = 0; head < queue.length; head++)
      for (const j of links[queue[head]!]!)
        if (!groupFor.has(j)) {
          groupFor.set(j, id);
          queue.push(j);
        }
  });
  const active = s.buildings.filter((b) => b.state === 'active');
  for (const b of active) {
    const footprint = zoneBuildingFootprint(b),
      candidates = new Set<number>();
    for (const k of keys(footprint, UTILITY_RULES.waterReachM))
      for (const i of buckets.get(k) ?? []) candidates.add(i);
    let best = Infinity,
      index = -1;
    for (const i of candidates) {
      const d = shapeDistance(footprint, true, pipes[i]!.points, false);
      if (
        d <= UTILITY_RULES.waterReachM + POWER.epsilon &&
        (d < best - POWER.epsilon ||
          (Math.abs(d - best) <= POWER.epsilon &&
            (index < 0 || pipes[i]!.id < pipes[index]!.id)))
      ) {
        best = d;
        index = i;
      }
    }
    if (index >= 0) groups[groupFor.get(index)!]!.push(b);
  }
  const capacities = (b: Building) => {
    const def = waterDefinition(b.defId);
    return def &&
      'water' in def &&
      b.enabled !== false &&
      !b.fire?.burning &&
      (b.flags & POWER.flag) !== 0
      ? {
          ...def.water,
          capacityM3PerWeek: def.water.capacityM3PerWeek * s.budgets.water,
        }
      : undefined;
  };
  const supplied = new Set<number>(),
    drained = new Set<number>(),
    contamination = new Map<number, number>(),
    discharge = new Map<number, number>();
  let served = 0,
    treated = 0;
  for (const group of groups)
    for (const kind of ['water', 'sewage'] as const) {
      const sources = group.filter((b) => capacities(b)?.output === kind);
      let remaining = sources.reduce(
        (sum, b) => sum + capacities(b)!.capacityM3PerWeek,
        0,
      );
      if (!remaining) continue;
      const totalCapacity = remaining;
      const pollution =
        kind === 'water'
          ? sources.reduce(
              (sum, b) =>
                sum +
                capacities(b)!.capacityM3PerWeek *
                  (b.defId === 'water_pump'
                    ? s.fields.waterPollution[
                        fieldIndex(
                          intakePoint(b.pos, b.rotation),
                          s.fields.size,
                        )
                      ]!
                    : 0),
              0,
            ) / totalCapacity
          : 0;
      let discharged = 0;
      const near = (b: Building) =>
        Math.min(...sources.map((source) => distance(b.pos, source.pos)));
      for (const b of [...group].sort(
        (a, b) => near(a) - near(b) || a.id - b.id,
      )) {
        const load =
          demand(b) *
          policyValue(s, b.pos, 'waterMultiplier', 1) *
          (kind === 'sewage' ? UTILITY_RULES.sewageToWaterRatio : 1);
        if (load > remaining + POWER.epsilon) break;
        remaining -= load;
        if (kind === 'water') {
          supplied.add(b.id);
          if (b.kind === 'zoned') contamination.set(b.id, pollution);
          served += load;
        } else {
          drained.add(b.id);
          treated += load;
          discharged += load;
        }
      }
      if (kind === 'sewage')
        for (const source of sources)
          discharge.set(
            source.id,
            (discharged * capacities(source)!.capacityM3PerWeek) /
              totalCapacity,
          );
    }
  let produced = 0,
    capacity = 0,
    consumed = 0,
    unserved = 0,
    uncollected = 0;
  for (const b of active) {
    const d = capacities(b);
    if (d?.output === 'water') produced += d.capacityM3PerWeek;
    else if (d) capacity += d.capacityM3PerWeek;
    const load = demand(b) * policyValue(s, b.pos, 'waterMultiplier', 1);
    consumed += load;
    if (load > 0 && !supplied.has(b.id)) unserved++;
    if (load > 0 && !drained.has(b.id)) uncollected++;
  }
  const patches: BuildingPatch[] = [];
  for (const b of s.buildings) {
    const flags =
      (b.flags & ~(W.waterFlag | W.sewageFlag)) |
      (supplied.has(b.id) ? W.waterFlag : 0) |
      (drained.has(b.id) ? W.sewageFlag : 0);
    const drinkingWaterPollution = contamination.get(b.id) ?? 0,
      sewageDischarge = discharge.get(b.id) ?? 0;
    if (
      flags !== b.flags ||
      (b.drinkingWaterPollution ?? 0) !== drinkingWaterPollution ||
      (b.sewageDischarge ?? 0) !== sewageDischarge
    ) {
      b.flags = flags;
      b.drinkingWaterPollution = drinkingWaterPollution;
      b.sewageDischarge = sewageDischarge;
      patches.push({
        id: b.id,
        flags,
        drinkingWaterPollution,
        sewageDischarge,
      });
    }
  }
  s.stats.water = {
    produced,
    consumed,
    served,
    unserved,
    groups: groups.length,
  };
  s.stats.sewage = {
    capacity,
    produced: consumed * UTILITY_RULES.sewageToWaterRatio,
    treated,
    uncollected,
  };
  return patches;
}
