import { incineratorOutput } from '../../world/garbage';
import { policyValue } from '../../world/policies';
import { POWER } from '../../data/power';
import { UTILITY_RULES } from '../../data/buildings';
import { distance } from '../../core/math';
import { plantOutput, shapeDistance } from '../../world/power';
import { zoneBuildingFootprint, polygonBounds } from '../../world/zoneGeometry';
import type { Building, Vec2 } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
function consumption(b: Building): number {
  if (b.kind !== 'zoned') return 0; // Service loads are unspecified; introduce them with their task cards.
  const p = UTILITY_RULES.powerMW;
  if (b.defId === 'RL' || b.defId === 'RH')
    return (b.housing?.occupied ?? b.households) * p.household;
  return (
    b.jobs *
    (b.defId === 'I'
      ? p.industrialJob
      : b.defId === 'O'
        ? p.officeJob
        : p.commercialJob)
  );
}
interface Node {
  points: Vec2[];
  closed: boolean;
  b?: Building;
  output: number;
  load: number;
}
// Connectivity depends on geometry alone; generation, demand and policies are recalculated.
const topology = new WeakMap<
  SimState,
  {
    shapes: { points: Vec2[]; closed: boolean }[];
    links: number[][];
  }
>();
function sameShapes(
  nodes: Node[],
  shapes: { points: Vec2[]; closed: boolean }[],
) {
  return (
    nodes.length === shapes.length &&
    nodes.every((n, i) => {
      const old = shapes[i]!;
      return (
        n.closed === old.closed &&
        n.points.length === old.points.length &&
        n.points.every(
          (p, j) => p.x === old.points[j]!.x && p.z === old.points[j]!.z,
        )
      );
    })
  );
}
/** Spatial broad phase, exact footprint gaps, then BFS islands and deterministic near-first supply. */
export function updatePower(s: SimState): BuildingPatch[] {
  const nodes: Node[] = s.buildings
    .filter((b) => b.state === 'active' && b.kind !== 'park')
    .map((b) => ({
      b,
      points: zoneBuildingFootprint(b),
      closed: true,
      output:
        (b.defId === 'garbage_incinerator'
          ? incineratorOutput(b)
          : plantOutput(s.seed, b.defId, b.pos)) * s.budgets.power,
      load: consumption(b) * policyValue(s, b.pos, 'powerMultiplier', 1),
    }));
  for (const n of s.networks.power)
    nodes.push({ points: n.points, closed: false, output: 0, load: 0 });
  const cached = topology.get(s);
  let links = cached?.links;
  if (!cached || !sameShapes(nodes, cached.shapes)) {
    links = nodes.map(() => [] as number[]);
    const buckets = new Map<string, number[]>();
    nodes.forEach((node, i) => {
      const box = polygonBounds(node.points),
        seen = new Set<number>(),
        reach = UTILITY_RULES.powerReachM;
      const keys: string[] = [];
      for (
        let z = Math.floor((box.minZ - reach) / POWER.graphCellM);
        z <= Math.floor((box.maxZ + reach) / POWER.graphCellM);
        z++
      )
        for (
          let x = Math.floor((box.minX - reach) / POWER.graphCellM);
          x <= Math.floor((box.maxX + reach) / POWER.graphCellM);
          x++
        ) {
          const key = `${x},${z}`;
          keys.push(key);
          for (const j of buckets.get(key) ?? [])
            if (!seen.has(j)) {
              seen.add(j);
              const other = nodes[j]!;
              if (
                shapeDistance(
                  node.points,
                  node.closed,
                  other.points,
                  other.closed,
                ) <=
                reach + POWER.epsilon
              ) {
                links![i]!.push(j);
                links![j]!.push(i);
              }
            }
        }
      for (const key of keys) {
        const bucket = buckets.get(key) ?? [];
        bucket.push(i);
        buckets.set(key, bucket);
      }
    });
    topology.set(s, {
      shapes: nodes.map((n) => ({
        closed: n.closed,
        points: n.points.map((p) => ({ ...p })),
      })),
      links,
    });
  }
  const seen = new Set<number>(),
    powered = new Set<number>();
  let produced = 0,
    consumed = 0,
    served = 0,
    groups = 0;
  for (let i = 0; i < nodes.length; i++)
    if (!seen.has(i)) {
      const queue = [i];
      seen.add(i);
      for (let head = 0; head < queue.length; head++)
        for (const next of links![queue[head]!]!)
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
      const group = queue.map((j) => nodes[j]!),
        sources = group.filter((n) => n.output > 0);
      let supply = sources.reduce((n, b) => n + b.output, 0);
      produced += supply;
      consumed += group.reduce((n, b) => n + b.load, 0);
      groups++;
      const near = (n: Node) =>
        Math.min(...sources.map((p) => distance(n.b!.pos, p.b!.pos)));
      const consumers = group
        .filter((n) => n.b)
        .sort((a, b) => near(a) - near(b) || a.b!.id - b.b!.id);
      for (const n of consumers) {
        if (!sources.length) break;
        if (n.load > supply + POWER.epsilon) break;
        if (n.load <= supply + POWER.epsilon) {
          supply -= n.load;
          served += n.load;
          powered.add(n.b!.id);
        }
      }
    }
  const patches: BuildingPatch[] = [];
  let unpowered = 0;
  for (const b of s.buildings) {
    const has = powered.has(b.id),
      flags = has ? b.flags | POWER.flag : b.flags & ~POWER.flag;
    if (b.state === 'active' && consumption(b) > 0 && !has) unpowered++;
    if (flags !== b.flags) {
      b.flags = flags;
      patches.push({ id: b.id, flags });
    }
  }
  s.stats.power = { produced, consumed, served, unpowered, groups };
  return patches;
}
