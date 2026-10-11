import { industryAt } from '../../world/industry';
import type { SimState } from '../state';
import type { BuildingPatch } from '../../world/snapshot';
/** Changing specialization retires on-site inventory rather than transmuting one commodity into another. */
export function updateIndustry(s: SimState): BuildingPatch[] {
  const patches: BuildingPatch[] = [];
  for (const b of s.buildings) {
    const industry = industryAt(s.districts, b);
    if (b.industry === industry) continue;
    b.industry = industry;
    if (b.cargo) {
      s.cargo.lost += b.cargo.stock;
      b.cargo.stock = 0;
      b.cargo.exportBlocked = false;
    }
    patches.push({
      id: b.id,
      industry,
      ...(b.cargo ? { cargo: { ...b.cargo } } : {}),
    });
  }
  return patches;
}
