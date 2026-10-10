import { MODEL_CATALOG } from '../data/modelCatalog';
import type { BuildingSpec } from '../data/buildingAppearance';
import type { Building } from './types';
export interface CatalogModel extends BuildingSpec {
  id: string;
  variant: number;
}
export function catalogModels(): CatalogModel[] {
  const result: CatalogModel[] = [];
  for (const [zone, rules] of Object.entries(MODEL_CATALOG))
    for (let level = 1; level <= rules.levels; level++)
      for (const [w, d] of rules.lots)
        for (let variant = 1; variant <= rules.variants; variant++) {
          result.push({
            id: `bld_${zone.toLowerCase()}_l${level}_${w}x${d}_${String(variant).padStart(2, '0')}`,
            zone: zone as CatalogModel['zone'],
            level,
            w,
            d,
            variant,
            seed: level * 1000 + w * 100 + d * 10 + variant,
          });
        }
  return result;
}
const models = catalogModels();
export function catalogModel(
  b: Pick<Building, 'defId' | 'level' | 'lotW' | 'lotD' | 'seed'>,
): CatalogModel | undefined {
  const rules = MODEL_CATALOG[b.defId as keyof typeof MODEL_CATALOG];
  if (!rules) return;
  return models.find(
    (m) =>
      m.zone === b.defId &&
      m.level === b.level &&
      m.w === b.lotW &&
      m.d === b.lotD &&
      m.variant === ((b.seed >>> 0) % rules.variants) + 1,
  );
}
export function visualSeed(
  b: Pick<Building, 'defId' | 'level' | 'lotW' | 'lotD' | 'seed'>,
): number {
  return catalogModel(b)?.seed ?? b.seed;
}
