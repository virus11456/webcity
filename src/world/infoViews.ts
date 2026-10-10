import { INFO, type InfoView } from '../data/infoViews';
import { MAP_SIZE, CELL_SIZE, SEA_LEVEL, WORLD } from '../data/config';
import { POWER } from '../data/power';
import { WATER_UTILITY } from '../data/waterUtility';
import type { Building } from './types';
import type { WorldSnapshot } from './snapshot';
import { fieldIndex } from './fieldSampling';
import { windAt } from './power';
export type InfoWorld = Pick<
  WorldSnapshot,
  'seed' | 'fields' | 'terrain' | 'buildings'
>;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function buildingInfo(
  view: InfoView,
  b: Building,
  s: InfoWorld,
): number | undefined {
  if (b.state !== 'active') return undefined;
  switch (view) {
    case 'power':
      return b.kind === 'park' ? undefined : Number(!!(b.flags & POWER.flag));
    case 'water':
      return b.kind === 'park'
        ? undefined
        : Number(!!(b.flags & WATER_UTILITY.waterFlag));
    case 'sewage':
      return b.kind === 'park'
        ? undefined
        : Number(!!(b.flags & WATER_UTILITY.sewageFlag));
    case 'landValue':
      return clamp((b.landValue ?? 0) / 100);
    case 'pollution':
      return (
        1 -
        clamp(
          (b.environment?.pollution ??
            s.fields.pollution[fieldIndex(b.pos, s.fields.size)]!) / 100,
        )
      );
    case 'waterPollution':
      if (b.kind !== 'zoned' && !b.defId.startsWith('water_')) return undefined;
      if (b.defId === 'water_tower') return 1;
      return (
        1 -
        clamp(
          (b.kind === 'zoned'
            ? (b.drinkingWaterPollution ?? 0)
            : (b.environment?.waterPollution ?? 0)) / 100,
        )
      );
    case 'noise':
      return 1 - clamp((b.environment?.noise ?? 0) / 100);
    case 'crime':
      return 1 - clamp((b.crime ?? 0) / 100);
    case 'health':
      return b.health?.residents ? clamp(b.health.average / 100) : undefined;
    case 'education': {
      if (b.housing)
        return b.residents > 0
          ? clamp(b.housing.averageEducation / 3)
          : undefined;
      const a = b.workerEducation,
        total = a?.reduce((sum, n) => sum + n, 0) ?? 0;
      return a && total
        ? clamp(a.reduce((sum, n, i) => sum + n * i, 0) / total / 3)
        : undefined;
    }
    case 'happiness':
      return b.happiness === undefined ? undefined : clamp(b.happiness / 100);
    case 'fireRisk':
      return b.fire?.burning ? 0 : clamp(b.coverage?.fire ?? 0);
    case 'population':
      return b.kind === 'zoned' && b.households > 0
        ? clamp(
            (b.residents * INFO.squareMetresPerHectare) /
              (b.lotW * b.lotD * CELL_SIZE ** 2) /
              INFO.densityMaxPerHectare,
          )
        : undefined;
    case 'wind':
      return windAt(s.seed, b.pos);
    default:
      return s.terrain.resources[view][fieldIndex(b.pos, s.fields.size)]! / 255;
  }
}
/** Read-only derived view: never writes simulation fields or invents missing service data. */
export function infoValues(view: InfoView, s: InfoWorld) {
  const n = s.fields.size,
    step = MAP_SIZE / n,
    field = new Float32Array(n * n).fill(NaN),
    buildings = new Map<number, number>();
  const dense = ['landValue', 'pollution', 'waterPollution', 'noise'].includes(
    view,
  );
  if (dense) {
    const values =
      s.fields[view as 'landValue' | 'pollution' | 'waterPollution' | 'noise'];
    for (let i = 0; i < field.length; i++)
      field[i] =
        view === 'landValue'
          ? clamp(values[i]! / 100)
          : 1 - clamp(values[i]! / 100);
    if (view === 'waterPollution')
      for (let z = 0; z < n; z++)
        for (let x = 0; x < n; x++) {
          const h = s.terrain.heights,
            row = WORLD.heightmapVertices,
            at = z * row + x;
          if (
            Math.min(h[at]!, h[at + 1]!, h[at + row]!, h[at + row + 1]!) >
            SEA_LEVEL
          )
            field[z * n + x] = NaN;
        }
  } else if (view === 'wind') {
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++)
        field[z * n + x] = windAt(s.seed, {
          x: (x + 0.5) * step - MAP_SIZE / 2,
          z: (z + 0.5) * step - MAP_SIZE / 2,
        });
  } else if (
    view === 'fertile' ||
    view === 'forest' ||
    view === 'ore' ||
    view === 'oil'
  ) {
    const values = s.terrain.resources[view];
    for (let i = 0; i < field.length; i++) field[i] = values[i]! / 255;
  }
  const sums = new Float32Array(dense ? 0 : n * n),
    counts = new Uint16Array(sums.length);
  for (const b of s.buildings) {
    const value = buildingInfo(view, b, s);
    if (value === undefined) continue;
    buildings.set(b.id, value);
    if (
      dense ||
      view === 'wind' ||
      view === 'fertile' ||
      view === 'forest' ||
      view === 'ore' ||
      view === 'oil'
    )
      continue;
    const cx = Math.floor((b.pos.x + MAP_SIZE / 2) / step),
      cz = Math.floor((b.pos.z + MAP_SIZE / 2) / step),
      r = Math.ceil(INFO.buildingSampleRadiusM / step);
    for (let z = Math.max(0, cz - r); z <= Math.min(n - 1, cz + r); z++)
      for (let x = Math.max(0, cx - r); x <= Math.min(n - 1, cx + r); x++) {
        if (
          Math.hypot(
            (x + 0.5) * step - MAP_SIZE / 2 - b.pos.x,
            (z + 0.5) * step - MAP_SIZE / 2 - b.pos.z,
          ) > INFO.buildingSampleRadiusM
        )
          continue;
        sums[z * n + x]! += value;
        counts[z * n + x]!++;
      }
  }
  for (let i = 0; i < counts.length; i++)
    if (counts[i]) field[i] = sums[i]! / counts[i]!;
  return { field, buildings };
}
