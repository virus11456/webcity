import { PERFORMANCE } from '../../data/performance';
import { MAP_SIZE } from '../../data/config';
import { PARKS } from '../../data/parks';
import { parkDefinition } from '../../world/parks';
import { zoneBuildingFootprint } from '../../world/zoneGeometry';
import type { SimState } from '../state';
interface ParkCache {
  inputs: number[];
  field: Float32Array;
}
const cache = new WeakMap<SimState, ParkCache>();
/** Compare value copies, not Building references: edits may mutate objects in place. */
function cacheInputs(s: SimState): number[] | undefined {
  if (
    s.fields.size ** 2 * Float32Array.BYTES_PER_ELEMENT >
    PERFORMANCE.parkFieldMaxBytes
  )
    return;
  const inputs = [s.fields.size, s.budgets.parks, PARKS.treeBonusCap];
  let sources = 0;
  for (const b of s.buildings) {
    const d = parkDefinition(b.defId);
    if (!d || b.state !== 'active' || b.enabled === false || b.fire?.burning)
      continue;
    if (++sources > PERFORMANCE.parkFieldMaxSources) return;
    // Preserve source order and every input to footprint/radius/strength and tree capping.
    inputs.push(
      b.pos.x,
      b.pos.z,
      b.rotation,
      b.lotW,
      b.lotD,
      d.radiusM ?? 0,
      d.landValueBonus ?? 0,
      b.defId === 'tree' ? 1 : 0,
    );
  }
  return inputs;
}
/** Sparse source rasterization; callers always own the returned array. */
export function parkField(s: SimState): Float32Array {
  const inputs = cacheInputs(s),
    previous = cache.get(s);
  if (
    inputs &&
    previous &&
    inputs.length === previous.inputs.length &&
    inputs.every((value, i) => Object.is(value, previous.inputs[i]))
  )
    return previous.field.slice();
  // One bounded entry per world; oversized inputs release any previously retained field.
  cache.delete(s);
  const n = s.fields.size,
    cell = MAP_SIZE / n,
    bonus = new Float32Array(n * n),
    trees = new Float32Array(n * n);
  for (const b of s.buildings) {
    const d = parkDefinition(b.defId);
    if (!d || b.state !== 'active' || b.enabled === false || b.fire?.burning)
      continue;
    const corners = zoneBuildingFootprint(b),
      pos = corners.reduce(
        (p, v) => ({
          x: p.x + v.x / corners.length,
          z: p.z + v.z / corners.length,
        }),
        { x: 0, z: 0 },
      );
    const radius = (d.radiusM ?? 0) * s.budgets.parks,
      strength = (d.landValueBonus ?? 0) * s.budgets.parks;
    if (!radius || !strength) continue;
    const field = b.defId === 'tree' ? trees : bonus;
    const minX = Math.max(
        0,
        Math.floor((pos.x - radius + MAP_SIZE / 2) / cell),
      ),
      maxX = Math.min(
        n - 1,
        Math.floor((pos.x + radius + MAP_SIZE / 2) / cell),
      );
    const minZ = Math.max(
        0,
        Math.floor((pos.z - radius + MAP_SIZE / 2) / cell),
      ),
      maxZ = Math.min(
        n - 1,
        Math.floor((pos.z + radius + MAP_SIZE / 2) / cell),
      );
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.hypot(
          (x + 0.5) * cell - MAP_SIZE / 2 - pos.x,
          (z + 0.5) * cell - MAP_SIZE / 2 - pos.z,
        );
        if (distance < radius)
          field[z * n + x]! += strength * (1 - distance / radius);
      }
  }
  for (let i = 0; i < bonus.length; i++)
    bonus[i]! += Math.min(PARKS.treeBonusCap, trees[i]!);
  if (inputs) cache.set(s, { inputs, field: bonus.slice() });
  return bonus;
}
