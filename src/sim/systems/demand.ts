import { clamp } from '../../core/math';
import { GAME_MODES } from '../../data/config';
import { DEMAND } from '../../data/simulation';
import { ZONES } from '../../data/zones';
import type { CityStats, ZoneType } from '../../world/types';
import type { SimState } from '../state';

export interface DemandInputs {
  residents: number;
  workers: number;
  unemployed: number;
  freeJobs: number;
  highEducationWorkers: number;
  jobs: Record<'C' | 'I' | 'O', number>;
  taxes: CityStats['demand']; // Fractional rates, e.g. 0.09.
  happiness: number;
  bonus: number;
  commercialShortageFraction: number;
  industrialExportBlockedFraction: number;
}

/** GDD §6: continuous values, then mode bonus and a single final clamp. */
export function calculateDemand(i: DemandInputs): CityStats['demand'] {
  const d = DEMAND;
  const tax = (zone: keyof CityStats['demand']) =>
    (i.taxes[zone] * d.scale - d.neutralTaxPercent) *
    d.taxPenaltyPerPercentagePoint;
  const early =
    Math.max(0, 1 - i.residents / d.earlyBonusPopulation) * d.maxEarlyBonus;
  const commercial = i.residents * d.commercialJobsPerResident;
  const industrial = i.residents * d.industrialJobsPerResident;
  const office = i.highEducationWorkers * d.officeJobsPerEducatedWorker;
  const shortage = (fraction: number) =>
    (clamp(fraction, 0, 1) / d.shortageFractionPerPenalty) * d.shortagePenalty;
  const values = {
    R:
      d.residentialBase +
      early +
      ((i.freeJobs - i.unemployed) /
        Math.max(d.minWorkerDenominator, i.workers)) *
        d.scale +
      (i.happiness - d.neutralHappiness) * d.happinessFactor -
      tax('R'),
    C:
      d.commercialBase +
      ((commercial - i.jobs.C) / Math.max(d.minJobDenominator, commercial)) *
        d.scale -
      shortage(i.commercialShortageFraction) -
      tax('C'),
    I:
      d.industrialBase +
      ((industrial + i.jobs.C * d.industrialJobsPerCommercialJob - i.jobs.I) /
        Math.max(d.minJobDenominator, industrial)) *
        d.scale -
      shortage(i.industrialExportBlockedFraction) -
      tax('I'),
    O:
      ((office - i.jobs.O) / Math.max(d.minJobDenominator, office)) * d.scale -
      tax('O'),
  };
  for (const key of Object.keys(values) as (keyof typeof values)[])
    values[key] = clamp(values[key] + i.bonus, ...d.range);
  return values;
}

/** Run after population settlement; reads active buildings, never preview models. */
export function updateDemand(s: SimState): void {
  let residents = 0,
    workers = 0,
    employed = 0,
    freeJobs = 0,
    highEducationWorkers = 0;
  let commercialBuildings = 0,
    shortages = 0;
  const jobs = { C: 0, I: 0, O: 0 };
  for (const b of s.buildings) {
    if (b.state !== 'active') continue;
    residents += b.residents;
    employed += b.workers;
    freeJobs += Math.max(0, b.jobs - b.workers);
    if (b.housing)
      b.housing.availableWorkers.forEach((n, education) => {
        workers += n;
        if (education >= DEMAND.highEducationMin) highEducationWorkers += n;
      });
    if (b.kind !== 'zoned' || !Object.hasOwn(ZONES, b.defId)) continue;
    const zone = ZONES[b.defId as ZoneType].demand;
    if (zone !== 'R') jobs[zone] += b.jobs;
    if (zone === 'C') {
      commercialBuildings++;
      if (b.problemTimers.noGoods > 0) shortages++;
    }
  }
  s.stats.demand = calculateDemand({
    residents,
    workers,
    unemployed: Math.max(0, workers - employed),
    freeJobs,
    highEducationWorkers,
    jobs,
    // Shared R/C demand uses the arithmetic mean of its two density tax rates.
    taxes: {
      R: (s.taxRates.RL + s.taxRates.RH) / 2,
      C: (s.taxRates.CL + s.taxRates.CH) / 2,
      I: s.taxRates.I,
      O: s.taxRates.O,
    },
    happiness: s.stats.happiness,
    bonus: GAME_MODES[s.settings.mode].demandBonus,
    commercialShortageFraction: commercialBuildings
      ? shortages / commercialBuildings
      : 0,
    // Cargo/export simulation does not exist until M2; do not invent a shortage.
    industrialExportBlockedFraction: 0,
  });
}
