// Frozen pre-cache rasterization for exact regression comparisons.
import { MAP_SIZE } from '../../src/data/config';
import { PARKS } from '../../src/data/parks';
import { parkDefinition } from '../../src/world/parks';
import { zoneBuildingFootprint } from '../../src/world/zoneGeometry';
import type { SimState } from '../../src/sim/state';
/** Sparse source rasterization; output is reused by the environment system. */
export function referenceParkField(s: SimState): Float32Array {
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
  return bonus;
}
