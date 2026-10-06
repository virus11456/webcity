import type { Building } from '../../world/types';
import { buildingCatalog } from '../../world/buildingCatalog';
import { BUILDING_RENDER as R } from '../../data/buildingRendering';
import type { BuildingSpec } from '../../data/buildingAppearance';
/** Explicit visual fixture, never inserted into the simulation or a saved city. */
export function districtFixture(count: number): Building[] {
  const catalog = buildingCatalog(11456);
  const featured: BuildingSpec[] = [
    { zone: 'RL', level: 2, w: 2, d: 2, seed: 11456 },
    { zone: 'RH', level: 3, w: 3, d: 3, seed: 11457 },
    { zone: 'I', level: 3, w: 4, d: 3, seed: 11458 },
    { zone: 'O', level: 2, w: 3, d: 3, seed: 11459 },
  ];
  const columns = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => {
    const s = count === 4 ? featured[i]! : catalog[i % catalog.length]!;
    return {
      id: i + 1,
      kind: 'zoned',
      defId: s.zone,
      level: s.level,
      lotW: s.w,
      lotD: s.d,
      seed: s.seed + i,
      pos:
        count === 4
          ? { x: (i - 1.5) * R.demoSpacing, z: -12 }
          : {
              x: ((i % columns) - columns / 2) * R.demoSpacing,
              z: (Math.floor(i / columns) - columns / 2) * R.demoSpacing,
            },
      rotation: 0,
      state: 'active',
      stateTimer: 0,
      flags: 0,
      households: 0,
      residents: 0,
      jobs: 0,
      workers: 0,
      problemTimers: {
        noPower: 0,
        noWater: 0,
        noSewage: 0,
        noRoad: 0,
        noWorkers: 0,
        noCustomers: 0,
        noGoods: 0,
        garbage: 0,
        crime: 0,
        sickness: 0,
        fire: 0,
      },
    };
  });
}
