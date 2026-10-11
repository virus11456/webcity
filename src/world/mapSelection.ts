import { Rng } from '../core/rng';
import {
  MAP_PRESETS,
  MAP_SELECTION,
  type TerrainPreset,
} from '../data/terrain';
/** Shared by the menu preview and Worker, so a random seed remains reproducible. */
export function resolveMap(
  id: string,
  seed: number,
): TerrainPreset | undefined {
  if (!Number.isSafeInteger(seed)) return undefined;
  if (id !== 'random') return MAP_PRESETS.find((p) => p.id === id);
  const rng = new Rng(seed ^ MAP_SELECTION.randomSalt);
  return {
    relief: rng.float(...MAP_SELECTION.relief),
    coast: rng.next() < MAP_SELECTION.coastChance,
  };
}
