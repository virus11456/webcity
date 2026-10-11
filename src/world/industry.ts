import { INDUSTRY_SPECIALIZATIONS } from '../data/policies';
import { districtAt, districtCell, type District } from './districts';
import type { Building } from './types';
export function industryDefinition(id: Building['industry']) {
  return INDUSTRY_SPECIALIZATIONS.find((d) => d.id === id);
}
export function industryAt(districts: readonly District[], b: Building) {
  return b.kind === 'zoned' && b.defId === 'I'
    ? districts.find((d) => d.id === districtAt(districts, b.pos))?.industry
    : undefined;
}
export function industryResource(
  b: Building,
  resources: Record<'forest' | 'fertile' | 'ore' | 'oil', Uint8Array>,
): number {
  const def = industryDefinition(b.industry);
  return def ? (resources[def.resource][districtCell(b.pos)] ?? 0) / 255 : 1;
}
