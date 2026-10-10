import { describe, expect, it } from 'vitest';
import {
  calculateDemand,
  updateDemand,
  type DemandInputs,
} from '../../src/sim/systems/demand';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { updatePopulation } from '../../src/sim/systems/population';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { TIME } from '../../src/data/config';
import { WorldMirror } from '../../src/bridge/mirror';
import type { Building } from '../../src/world/types';

const settings = {
  seed: 72,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Demand',
};
const input = (overrides: Partial<DemandInputs> = {}): DemandInputs => ({
  residents: 0,
  workers: 0,
  unemployed: 0,
  freeJobs: 0,
  highEducationWorkers: 0,
  jobs: { C: 0, I: 0, O: 0 },
  taxes: { R: 0.09, C: 0.09, I: 0.09, O: 0.09 },
  happiness: 50,
  bonus: 0,
  commercialShortageFraction: 0,
  industrialExportBlockedFraction: 0,
  ...overrides,
});
const building = (id: number, zone: string): Building => ({
  ...districtFixture(1)[0]!,
  id,
  defId: zone,
  state: 'active',
  level: 1,
  lotW: 2,
  lotD: 2,
  residents: 0,
  households: 0,
  jobs: 0,
  workers: 0,
});

describe('GDD RCIO demand', () => {
  it('starts with high residential demand and finite empty-city values', () => {
    expect(calculateDemand(input())).toEqual({ R: 70, C: 20, I: 20, O: 0 });
    expect(createState(settings).stats.demand).toEqual({
      R: 70,
      C: 20,
      I: 20,
      O: 0,
    });
  });
  it('adds easy mode bonus from initialization onward, with no sandbox bonus', () => {
    expect(createState({ ...settings, mode: 'easy' }).stats.demand).toEqual({
      R: 80,
      C: 30,
      I: 30,
      O: 10,
    });
    expect(createState({ ...settings, mode: 'sandbox' }).stats.demand.R).toBe(
      70,
    );
  });
  it('raises housing demand with vacancies and lowers it with unemployment', () => {
    const base = input({ residents: 1000, workers: 550 });
    const r = calculateDemand(base).R;
    expect(calculateDemand({ ...base, freeJobs: 100 }).R).toBeGreaterThan(r);
    expect(calculateDemand({ ...base, unemployed: 100 }).R).toBeLessThan(r);
  });
  it('fades the early bonus to zero at 1000 residents', () => {
    expect(calculateDemand(input({ residents: 500 })).R).toBe(50);
    expect(calculateDemand(input({ residents: 1000 })).R).toBe(30);
    expect(calculateDemand(input({ residents: 2000 })).R).toBe(30);
  });
  it.each(['R', 'C', 'I', 'O'] as const)(
    'converts fractional tax rates and subtracts four points per 1%% for %s',
    (zone) => {
      const base = input({
        residents: 500,
        workers: 275,
        highEducationWorkers: 100,
        jobs: { C: 90, I: 150, O: 25 },
      });
      const neutral = calculateDemand(base);
      const high = calculateDemand({
        ...base,
        taxes: { ...base.taxes, [zone]: 0.1 },
      });
      expect(high[zone]).toBeCloseTo(neutral[zone] - 4);
      for (const other of ['R', 'C', 'I', 'O'] as const)
        if (other !== zone) expect(high[other]).toBe(neutral[other]);
      expect(
        calculateDemand({ ...base, taxes: { ...base.taxes, [zone]: 0.08 } })[
          zone
        ],
      ).toBeCloseTo(neutral[zone] + 4);
    },
  );
  it('uses total jobs, commercial supply chain and educated workers in the formulas', () => {
    const d = calculateDemand(
      input({
        residents: 1000,
        workers: 550,
        highEducationWorkers: 100,
        jobs: { C: 180, I: 250, O: 20 },
      }),
    );
    expect(d.C).toBeCloseTo(30);
    expect(d.I).toBeCloseTo(20 + (60 / 220) * 100);
    expect(d.O).toBeCloseTo(50);
    expect(
      calculateDemand(input({ jobs: { C: 100, I: 100, O: 100 } })),
    ).toEqual({ R: 70, C: 0, I: 0, O: 0 });
  });
  it('applies happiness only to residential demand', () => {
    expect(calculateDemand(input({ happiness: 75 }))).toEqual({
      R: 80,
      C: 20,
      I: 20,
      O: 0,
    });
  });
  it('subtracts five points per ten percent shortage and bounds the ratios', () => {
    const base = input({ residents: 1000 });
    expect(
      calculateDemand({ ...base, commercialShortageFraction: 0.5 }).C,
    ).toBe(95);
    expect(
      calculateDemand({ ...base, industrialExportBlockedFraction: 0.5 }).I,
    ).toBe(95);
    expect(calculateDemand({ ...base, commercialShortageFraction: 2 }).C).toBe(
      70,
    );
  });
  it('clamps only after adding the easy bonus', () => {
    expect(
      calculateDemand(input({ jobs: { C: 20, I: 0, O: 0 }, bonus: 10 })).C,
    ).toBe(0);
    const d = calculateDemand(
      input({ freeJobs: 10000, highEducationWorkers: 10000, bonus: 10 }),
    );
    expect(d.R).toBe(100);
    expect(d.O).toBe(100);
  });
  it('reads only active buildings, aggregates both commercial densities, and detects noGoods', () => {
    const s = createState(settings);
    const c = building(1, 'CL'),
      h = building(2, 'CH'),
      i = building(3, 'I'),
      r = building(4, 'RH');
    s.buildings = [c, h, i, r];
    for (let day = 1; day <= 4; day++) {
      s.clock.day = day;
      updatePopulation(s, true);
    }
    r.residents = 1000;
    c.jobs = h.jobs = 90;
    const before = structuredClone(s.buildings);
    updateDemand(s);
    const first = { ...s.stats.demand };
    c.problemTimers.noGoods = 1;
    updateDemand(s);
    expect(first.C).toBeCloseTo(30);
    expect(s.stats.demand.C).toBeCloseTo(5);
    const inactive = {
      ...building(5, 'O'),
      state: 'construction' as const,
      jobs: 10000,
      workers: 10000,
      residents: 10000,
    };
    s.buildings.push(inactive);
    const expected = { ...s.stats.demand };
    updateDemand(s);
    expect(s.stats.demand).toEqual(expected);
    expect(before[2]).toEqual(i); // demand does not mutate buildings
    c.state = h.state = i.state = r.state = 'abandoned';
    updateDemand(s);
    expect(s.stats.demand).toEqual({ R: 70, C: 20, I: 20, O: 0 });
  });
  it('uses mean tax for shared density demand, including an empty city', () => {
    const s = createState(settings);
    s.taxRates.RH = 0.11;
    s.taxRates.CH = 0.13;
    updateDemand(s);
    expect(s.stats.demand.R).toBeCloseTo(66);
    expect(s.stats.demand.C).toBeCloseTo(12);
  });
  it('settles population before demand and publishes the same daily snapshot to the mirror', () => {
    const mirror = new WorldMirror();
    const sim = new Simulation(settings, (e) => mirror.apply(e));
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    const remove = sim.onDay((s) => {
      s.buildings = [building(1, 'RL'), building(2, 'CL')];
      for (const b of s.buildings) b.flags = 7;
    });
    for (let n = 0; n < TIME.ticksPerDay; n++) sim.tick();
    remove();
    const before = sim.snapshot().stats.demand;
    for (let n = 0; n < TIME.ticksPerDay - 1; n++) sim.tick();
    expect(sim.snapshot().stats.demand).toEqual(before);
    sim.tick();
    const snapshot = sim.snapshot();
    expect(snapshot.stats.population).toBeGreaterThan(0);
    expect(snapshot.stats.demand).not.toEqual(before);
    expect(mirror.readStats()?.demand).toEqual(snapshot.stats.demand);
    expect(snapshot.statsHistory.at(-1)?.demand).toEqual(snapshot.stats.demand);
    sim.setSpeed(0);
    for (let n = 0; n < TIME.ticksPerDay; n++) sim.tick();
    expect(sim.snapshot().stats.demand).toEqual(snapshot.stats.demand);
  });
});
