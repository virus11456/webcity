import { describe, it, expect } from 'vitest';
import {
  buildingCapacity,
  distribute,
  jobPlaces,
  initialHousing,
  summarizeHousing,
} from '../../src/world/population';
import { ZONES, type ZoneType } from '../../src/data/zones';
import { POPULATION_PROFILE } from '../../src/data/simulation';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { createState } from '../../src/sim/state';
import { updatePopulation } from '../../src/sim/systems/population';
import { Simulation } from '../../src/sim/simulation';
import { WorldMirror } from '../../src/bridge/mirror';
import type { Building, EducationCounts } from '../../src/world/types';
function building(id: number, zone: ZoneType = 'RL', x = 0): Building {
  return {
    ...districtFixture(1)[0]!,
    id,
    defId: zone,
    state: 'active',
    pos: { x, z: 0 },
    rotation: 0,
    level: 1,
    lotW: 2,
    lotD: 2,
    households: 0,
    residents: 0,
    jobs: 0,
    workers: 0,
  };
}
function fixture(...buildings: Building[]) {
  const s = createState({
    seed: 72,
    mapId: 'valley',
    mode: 'normal',
    cityName: 'Population',
  });
  s.buildings = buildings;
  s.clock.day = 1;
  return s;
}
function settle(s: ReturnType<typeof fixture>, days = 20) {
  for (let i = 0; i < days; i++) {
    s.clock.day++;
    updatePopulation(s, true);
  }
}
function occupied(id: number, residents: number, x = 0): Building {
  const b = building(id, 'RH', x);
  b.level = 5;
  b.lotW = b.lotD = 4;
  b.housing = initialHousing(b, 90);
  b.housing.sizes = [0, 0, 0, 0, Math.floor(residents / 5)];
  if (residents % 5) b.housing.sizes[(residents % 5) - 1]!++;
  b.residents = summarizeHousing(b.housing);
  return b;
}
describe('population capacities and integer aggregates', () => {
  it.each(Object.keys(ZONES) as ZoneType[])(
    '%s capacity matches every level and legal lot',
    (zone) => {
      const d = ZONES[zone];
      for (let l = 1; l <= d.maxLevel; l++)
        for (let w = d.lotWidthCells[0]; w <= d.lotWidthCells[1]; w++)
          for (
            let depth = d.lotDepthCells[0];
            depth <= d.lotDepthCells[1];
            depth++
          ) {
            const b = { ...building(1, zone), level: l, lotW: w, lotD: depth };
            expect(buildingCapacity(b)).toBe(
              Math.max(1, Math.round(w * depth * d.capacityPerCell[l - 1]!)),
            );
            if (!['RL', 'RH'].includes(zone))
              expect(jobPlaces(b).reduce((a, n) => a + n, 0)).toBe(
                buildingCapacity(b),
              );
          }
    },
  );
  it('does not give capacity to construction, abandoned, burned or non-zoned buildings', () => {
    for (const state of ['construction', 'abandoned', 'burned'] as const)
      expect(buildingCapacity({ ...building(1), state })).toBe(0);
    expect(buildingCapacity({ ...building(1), kind: 'service' })).toBe(0);
  });
  it('apportions fractional education places exactly with stable tie breaks', () => {
    expect(distribute(1, [40, 40, 15, 5])).toEqual([1, 0, 0, 0]);
    expect(distribute(2, [40, 40, 15, 5])).toEqual([1, 1, 0, 0]);
    for (let n = 0; n < 500; n++)
      expect(distribute(n, [40, 40, 15, 5]).reduce((a, b) => a + b, 0)).toBe(n);
    expect(
      POPULATION_PROFILE.householdSizePercent.reduce(
        (a, n, i) => a + (n * (i + 1)) / 100,
        0,
      ),
    ).toBeCloseTo(2.6);
  });
  it('migrates at most one household per building per day and never past capacity', () => {
    const b = building(1),
      s = fixture(b);
    updatePopulation(s, true);
    expect(b.households).toBe(2);
    expect(b.housing!.occupied).toBe(1);
    expect(b.residents).toBeGreaterThanOrEqual(1);
    expect(b.residents).toBeLessThanOrEqual(5);
    const residents = b.residents;
    updatePopulation(s, true);
    expect(b.residents).toBe(residents);
    settle(s, 20);
    expect(b.housing!.occupied).toBe(2);
    expect(b.residents).toBeGreaterThanOrEqual(2);
    expect(b.residents).toBeLessThanOrEqual(10);
    expect(b.housing!.education.reduce((a, n) => a + n, 0)).toBe(b.residents);
    expect(b.housing!.ages.reduce((a, n) => a + n, 0)).toBe(b.residents);
    expect(b.housing!.availableWorkers.reduce((a, n) => a + n, 0)).toBe(
      Math.floor(b.residents * 0.55),
    );
  });
  it('does not move into unfinished, disconnected or pending-rezone homes', () => {
    const s = fixture(
      { ...building(1), state: 'construction' },
      { ...building(2), roadDisconnectedDay: 0 },
      { ...building(3), rezoneAtTick: 30 },
    );
    settle(s);
    expect(s.stats.population).toBe(0);
  });
  it('samples 1–5 person households with the configured mean over a fixed population', () => {
    const s = fixture(
      ...Array.from({ length: 4000 }, (_, i) => building(i + 1)),
    );
    updatePopulation(s, true);
    const mean = s.stats.population / 4000;
    expect(mean).toBeGreaterThan(2.52);
    expect(mean).toBeLessThan(2.68);
    expect(s.buildings.every((b) => b.housing!.occupied === 1)).toBe(true);
  });
});
describe('qualified nearest-job matching', () => {
  it('conserves the city labour fraction even across one-person homes', () => {
    const s = fixture(occupied(1, 1), occupied(2, 1), building(3, 'I'));
    updatePopulation(s);
    expect(s.stats.population).toBe(2);
    expect(s.stats.populationDetails!.availableWorkers).toBe(1);
    expect(s.stats.populationDetails!.employed).toBe(1);
    expect(s.buildings[0]!.housing!.availableWorkers).toEqual([1, 0, 0, 0]);
  });
  it('fills the nearest eligible workplace first and never exceeds supply or slots', () => {
    const home = occupied(1, 100),
      near = building(3, 'I', 10),
      far = building(2, 'I', 200);
    const s = fixture(home, far, near);
    updatePopulation(s);
    expect(near.workers).toBe(near.jobs);
    expect(far.workers).toBeLessThanOrEqual(far.jobs);
    const assignments = home.housing!.assignments;
    expect(assignments[0]!.workplaceId).toBe(near.id);
    for (const a of assignments)
      expect(a.education).toBeGreaterThanOrEqual(a.requiredEducation);
    expect(assignments.reduce((sum, a) => sum + a.workers, 0)).toBe(
      near.workers + far.workers,
    );
    expect(home.housing!.employed).toBeLessThanOrEqual(
      home.housing!.availableWorkers.reduce((a, n) => a + n, 0),
    );
    expect(
      s.stats.populationDetails!.unemployed +
        s.stats.populationDetails!.employed,
    ).toBe(s.stats.populationDetails!.availableWorkers);
  });
  it('does not put unqualified workers in the closer office and allows higher education in lower-level slots', () => {
    const home = occupied(1, 20),
      office = building(2, 'O', 1),
      industry = building(3, 'I', 20),
      s = fixture(home, office, industry);
    updatePopulation(s);
    expect(
      home.housing!.assignments.some(
        (a) => a.education === 0 && a.workplaceId === industry.id,
      ),
    ).toBe(true);
    expect(
      home
        .housing!.assignments.filter((a) => a.workplaceId === office.id)
        .every((a) => a.education >= 1),
    ).toBe(true);
    const big = fixture(occupied(1, 100), {
      ...building(2, 'I'),
      lotW: 4,
      lotD: 4,
    });
    updatePopulation(big);
    expect(
      big.buildings[0]!.housing!.assignments.some(
        (a) => a.education > a.requiredEducation,
      ),
    ).toBe(true);
  });
  it('uses stable IDs for equal distances, independent of snapshot array order', () => {
    const s = fixture(
        occupied(1, 20),
        building(3, 'I', 10),
        building(2, 'I', -10),
      ),
      other = fixture(...structuredClone(s.buildings).reverse());
    updatePopulation(s);
    updatePopulation(other);
    expect(s.buildings[0]!.housing!.assignments[0]!.workplaceId).toBe(2);
    expect(other.buildings.find((b) => b.id === 1)!.housing).toEqual(
      s.buildings[0]!.housing,
    );
  });
  it('clears old assignments immediately after housing/jobs disappear or become unavailable', () => {
    const s = fixture(occupied(1, 20), building(2, 'I'));
    updatePopulation(s);
    expect(s.stats.populationDetails!.employed).toBeGreaterThan(0);
    s.buildings = s.buildings.filter((b) => b.id !== 2);
    updatePopulation(s);
    expect(s.buildings[0]!.housing!.assignments).toEqual([]);
    expect(s.stats.populationDetails!.employed).toBe(0);
    s.buildings.push(building(3, 'I'));
    updatePopulation(s);
    expect(s.stats.populationDetails!.employed).toBeGreaterThan(0);
    s.buildings[0]!.state = 'abandoned';
    updatePopulation(s);
    expect(s.stats.population).toBe(0);
    expect(s.buildings[1]!.workers).toBe(0);
    expect(s.stats.populationDetails!.movedOut).toBe(20);
  });
  it('limits each education supply across multiple workplaces and homes', () => {
    const s = fixture(
      occupied(1, 9),
      occupied(2, 9),
      ...Array.from({ length: 15 }, (_, i) => building(i + 3, 'I', i * 20)),
    );
    updatePopulation(s);
    const employed: EducationCounts = [0, 0, 0, 0];
    for (const b of s.buildings) {
      expect(b.workers).toBeLessThanOrEqual(b.jobs);
      b.workerEducation?.forEach((n, i) => (employed[i]! += n));
    }
    for (let e = 0; e < 4; e++)
      expect(employed[e]).toBeLessThanOrEqual(
        s.buildings
          .slice(0, 2)
          .reduce((sum, b) => sum + b.housing!.availableWorkers[e]!, 0),
      );
  });
});
describe('moving out and replay', () => {
  it('uses the strict happiness threshold and roughly 2% daily household departures without refilling', () => {
    const s = fixture(
      ...Array.from({ length: 4000 }, (_, i) => building(i + 1)),
    );
    updatePopulation(s, true);
    s.stats.happiness = 29;
    s.clock.day++;
    const before = s.stats.population;
    updatePopulation(s, true);
    const empty = s.buildings.filter((b) => b.housing!.occupied === 0).length;
    expect(empty).toBeGreaterThan(45);
    expect(empty).toBeLessThan(115);
    expect(s.stats.populationDetails!.movedIn).toBe(0);
    expect(s.stats.populationDetails!.movedOut).toBe(
      before - s.stats.population,
    );
    const b = fixture(building(1));
    b.stats.happiness = 30;
    updatePopulation(b, true);
    expect(b.buildings[0]!.housing!.occupied).toBe(1);
  });
  it('replays the same demographic state and day flows from equal seeds', () => {
    const a = fixture(building(1), building(2), building(3, 'CL')),
      b = fixture(...structuredClone(a.buildings));
    settle(a, 10);
    settle(b, 10);
    a.stats.happiness = b.stats.happiness = 20;
    settle(a, 100);
    settle(b, 100);
    expect(a.buildings).toEqual(b.buildings);
    expect(a.stats).toEqual(b.stats);
  });
  it('reconciles capacities without migration and leaves the next daily boundary to move people in', () => {
    const s = fixture(building(1), building(2, 'CL'));
    updatePopulation(s);
    expect(s.stats.population).toBe(0);
    expect(s.buildings[0]!.households).toBe(2);
    expect(s.buildings[1]!.jobs).toBe(8);
    updatePopulation(s, true);
    expect(s.stats.population).toBeGreaterThan(0);
  });
  it('mirrors stats defensively and pauses actual daily migration', () => {
    const mirror = new WorldMirror(),
      sim = new Simulation(
        { seed: 72, mapId: 'valley', mode: 'normal', cityName: 'Integration' },
        (e) => mirror.apply(e),
      );
    let authority: ReturnType<typeof fixture> | undefined;
    const off = sim.onDay((s) => {
      authority = s;
      s.buildings = [building(1), building(2, 'I')];
    });
    for (let i = 0; i < 10; i++) sim.tick();
    off();
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    for (let i = 0; i < 10; i++) sim.tick();
    expect(sim.snapshot().stats.population).toBeGreaterThan(0);
    expect(mirror.readStats()).toEqual(sim.snapshot().stats);
    const snapshot = sim.snapshot();
    sim.setSpeed(0);
    for (let i = 0; i < 100; i++) sim.tick();
    expect(sim.snapshot().buildings).toEqual(snapshot.buildings);
    const stats = mirror.readStats()!;
    stats.populationDetails!.employed = 9000;
    expect(mirror.readStats()!.populationDetails!.employed).not.toBe(9000);
    expect(authority!.citizens).toEqual([]);
    const history = sim.snapshot().statsHistory;
    expect(sim.bulldoze([{ kind: 'building', id: 1 }]).ok).toBe(true);
    expect(mirror.readStats()!.population).toBe(0);
    expect(sim.snapshot().statsHistory).toEqual(history);
    expect(mirror.readSnapshot()!.statsHistory).toEqual(history);
  });
});
