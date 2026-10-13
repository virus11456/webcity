import type { BuildingPatch } from '../world/snapshot';

/** Ordered shallow merge; clone once per ID without mutating any source patch.
 * The caller must still clone the completed event before crossing the state boundary. */
export function mergeBuildingPatches(
  patches: readonly BuildingPatch[],
): BuildingPatch[] {
  const merged = new Map<number, BuildingPatch>();
  for (const patch of patches) {
    const existing = merged.get(patch.id);
    if (existing) Object.assign(existing, patch);
    else merged.set(patch.id, { ...patch });
  }
  return [...merged.values()];
}
