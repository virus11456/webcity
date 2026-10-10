import { Rng } from '../../core/rng';
import { citizenSystem } from './citizens';
import { CITIZENS, POPULATION_PROFILE } from '../../data/simulation';
import {
  buildingCapacity,
  initialHousing,
  residential,
} from '../../world/population';
import type { Building } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';

function patch(b: Building): BuildingPatch {
  return {
    id: b.id,
    households: b.households,
    residents: b.residents,
    jobs: b.jobs,
    workers: b.workers,
    housing: b.housing,
    jobEducation: b.jobEducation,
    workerEducation: b.workerEducation,
  };
}
function pick(weights: readonly number[], rng: Rng): number {
  let draw = rng.float(
    0,
    weights.reduce((a, b) => a + b, 0),
  );
  for (let i = 0; i < weights.length; i++) {
    draw -= weights[i]!;
    if (draw < 0) return i;
  }
  return weights.length - 1;
}
/** Household migration and agent-authoritative employment; structural edits do not advance lifetimes. */
export function updatePopulation(
  s: SimState,
  migrate = false,
): BuildingPatch[] {
  const before = new Map(
    s.buildings.map((b) => [b.id, JSON.stringify(patch(b))]),
  );
  const previousPopulation = s.stats.population;
  const citizens = citizenSystem(s);
  const life = migrate ? citizens.daily() : { births: 0, deaths: 0 };
  let movedIn = 0,
    movedOut = 0;
  const homes: Building[] = [];
  for (const b of s.buildings) {
    if (b.kind !== 'zoned') continue;
    const capacity = buildingCapacity(b);
    if (residential(b)) {
      const h = (b.housing ??= initialHousing(b, capacity));
      b.households = capacity;
      b.jobs = b.workers = 0;
      b.jobEducation = undefined;
      b.workerEducation = undefined;
      // Shrinking or disabling capacity displaces complete households without phantom residents.
      let occupied = h.sizes.reduce((a, n) => a + n, 0);
      for (let i = h.sizes.length - 1; i >= 0 && occupied > capacity; i--) {
        const remove = Math.min(h.sizes[i]!, occupied - capacity);
        h.sizes[i]! -= remove;
        occupied -= remove;
      }
      if (migrate && h.lastMigrationDay !== s.clock.day) {
        h.lastMigrationDay = s.clock.day;
        const rng = new Rng(
          s.seed ^
            Math.imul(b.id, 0x85ebca6b) ^
            Math.imul(s.clock.day, 0x9e3779b1),
        );
        if (
          (b.happiness ?? s.stats.happiness) < CITIZENS.moveOutHappinessBelow
        ) {
          if (occupied && rng.next() < CITIZENS.moveOutChancePerDay) {
            const size = pick(h.sizes, rng);
            h.sizes[size]!--;
            movedOut += size + 1;
          }
        } else if (
          b.roadDisconnectedDay === undefined &&
          b.rezoneAtTick === undefined
        ) {
          for (
            let i = 0;
            i <
            Math.min(
              CITIZENS.maxMoveInHouseholdsPerBuildingDay,
              capacity - occupied,
            );
            i++
          ) {
            const size = pick(POPULATION_PROFILE.householdSizePercent, rng);
            h.sizes[size]!++;
            movedIn += size + 1;
          }
        }
      }
      b.residents = h.sizes.reduce((sum, n, i) => sum + n * (i + 1), 0);
      homes.push(b);
    } else {
      b.households = b.residents = 0;
      b.housing = undefined;
      b.jobs = capacity;
    }
  }
  citizens.reconcile();
  const population = s.buildings.reduce((sum, b) => sum + b.residents, 0);
  const jobs = s.buildings.reduce((sum, b) => sum + b.jobs, 0),
    employed = s.buildings.reduce((sum, b) => sum + b.workers, 0);
  const available = homes.reduce(
    (sum, b) => sum + b.housing!.availableWorkers.reduce((a, n) => a + n, 0),
    0,
  );
  // Demolition/abandonment/capacity reduction count as displaced residents in today's outflow.
  const displaced = Math.max(
    0,
    previousPopulation +
      movedIn -
      movedOut +
      (life.births - life.deaths) -
      population,
  );
  const previous =
    s.stats.populationDetails?.day === s.clock.day
      ? s.stats.populationDetails
      : undefined;
  s.stats.population = population;
  s.stats.populationDetails = {
    day: s.clock.day,
    households: homes.reduce((sum, b) => sum + b.households, 0),
    occupiedHouseholds: homes.reduce((sum, b) => sum + b.housing!.occupied, 0),
    availableWorkers: available,
    employed,
    unemployed: Math.max(0, available - employed),
    jobs,
    vacancies: Math.max(0, jobs - employed),
    movedIn: (previous?.movedIn ?? 0) + movedIn,
    movedOut: (previous?.movedOut ?? 0) + movedOut + displaced,
  };
  return s.buildings
    .filter((b) => JSON.stringify(patch(b)) !== before.get(b.id))
    .map(patch);
}
