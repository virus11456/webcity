import { BUILDING_ZONES, type BuildingSpec } from '../data/buildingAppearance';
import { ZONES } from '../data/zones';
/** Every legal zone/level/lot combination, in stable order for gallery paging and validation. */
export function buildingCatalog(seed: number): BuildingSpec[] {
  return BUILDING_ZONES.flatMap((zone) => {
    const r = ZONES[zone],
      specs: BuildingSpec[] = [];
    for (let level = 1; level <= r.maxLevel; level++)
      for (let w = r.lotWidthCells[0]; w <= r.lotWidthCells[1]; w++)
        for (let d = r.lotDepthCells[0]; d <= r.lotDepthCells[1]; d++)
          specs.push({ zone, level, w, d, seed });
    return specs;
  });
}
