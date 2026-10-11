import type { Building, CityStats, EducationCounts } from './types';
import type { RoadTraffic } from './roadTraffic';
import { roadTrafficBand } from './roadTraffic';
/** Aggregate Worker-authored housing summaries and full traffic, never the capped renderer stream. */
export function cityStatistics(
  buildings: readonly Building[],
  stats: CityStats,
  roads: readonly RoadTraffic[],
) {
  const ages: EducationCounts = [0, 0, 0, 0],
    education: EducationCounts = [0, 0, 0, 0];
  for (const b of buildings) {
    if (!b.housing || b.state !== 'active') continue;
    for (let i = 0; i < 4; i++) {
      ages[i]! += b.housing.ages[i]!;
      education[i]! += b.housing.education[i]!;
    }
  }
  let vehicles = 0,
    speed = 0,
    flow = 0,
    blocked = 0;
  for (const r of roads) {
    vehicles += r.count;
    speed += r.speedKmh * r.count;
    flow += r.ratio * r.count;
    if (r.count && roadTrafficBand(r.ratio) === 'blocked') blocked++;
  }
  const p = stats.populationDetails;
  return {
    population: stats.population,
    ages,
    education,
    households: p?.occupiedHouseholds ?? 0,
    movedIn: p?.movedIn ?? 0,
    movedOut: p?.movedOut ?? 0,
    availableWorkers: p?.availableWorkers ?? 0,
    employed: p?.employed ?? 0,
    unemployed: p?.unemployed ?? 0,
    unemployment: p?.availableWorkers
      ? p.unemployed / p.availableWorkers
      : null,
    jobs: p?.jobs ?? 0,
    vacancies: p?.vacancies ?? 0,
    vehicles,
    speedKmh: vehicles ? speed / vehicles : null,
    flow: vehicles ? flow / vehicles : null,
    blocked,
  };
}
