import { describe, it, expect } from 'vitest';
import { createState } from '../../src/sim/state';
import { updateCrime } from '../../src/sim/systems/police';
import { updateProblems } from '../../src/sim/systems/problems';
import { ServiceSystem } from '../../src/sim/systems/services';
import { RoadGraph } from '../../src/world/roadGraph';
import { buildingProblemIcons } from '../../src/world/buildingProblems';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { migrateSave } from '../../src/save/migrations';
import { serialize, deserialize } from '../../src/save/serializer';
import { TIME } from '../../src/data/config';
function fixture() {
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: 'Police',
  });
  s.buildings = [
    {
      ...structuredClone(districtFixture(1)[0]!),
      id: 100,
      defId: 'RL',
      kind: 'zoned' as const,
      state: 'active' as const,
      flags: 7,
      households: 2,
      residents: 0,
      jobs: 0,
      workers: 0,
      crime: 79.5,
    },
  ];
  s.nextId = 101;
  return { s, b: s.buildings[0]! };
}
describe('daily crime and police', () => {
  it('crosses 80 without coverage, produces the immediate icon, and updates only once each day', () => {
    const { s, b } = fixture();
    s.clock.day = 1;
    s.clock.ticks = TIME.ticksPerDay;
    expect(updateCrime(s)).toHaveLength(1);
    expect(b.crime).toBe(80);
    updateProblems(s);
    expect(b.problemTimers.crime).toBe(0);
    expect(buildingProblemIcons(b)).toContain('crime');
    expect(updateCrime(s)).toEqual([]);
    expect(b.crime).toBe(80);
    s.clock.day++;
    updateCrime(s);
    expect(b.crime).toBe(80.5);
  });
  it('applies the documented unemployment fraction and exact police coverage reduction', () => {
    const { s, b } = fixture();
    s.stats.populationDetails = {
      day: 0,
      households: 0,
      occupiedHouseholds: 0,
      availableWorkers: 100,
      employed: 75,
      unemployed: 25,
      jobs: 75,
      vacancies: 0,
      movedIn: 0,
      movedOut: 0,
    };
    b.coverage = { police: 0.6 };
    s.clock.day = 1;
    updateCrime(s);
    expect(b.crime).toBeCloseTo(78.7);
    expect(buildingProblemIcons(b)).not.toContain('crime');
    b.coverage = {};
    s.clock.day++;
    updateCrime(s);
    expect(b.crime).toBeCloseTo(79.7);
  });
  it('clamps to 0..100, handles no workforce, and skips construction/abandonment', () => {
    const { s, b } = fixture();
    b.crime = 0;
    b.coverage = { police: 1 };
    updateCrime(s);
    expect(b.crime).toBe(0);
    b.crime = 100;
    b.coverage = {};
    s.clock.day++;
    updateCrime(s);
    expect(b.crime).toBe(100);
    for (const state of ['construction', 'abandoned', 'burned'] as const) {
      b.state = state;
      s.clock.day++;
      expect(updateCrime(s)).toEqual([]);
      expect(b.crime).toBe(100);
    }
  });
  it('uses actual road coverage and disables the crime reduction when the station is switched off', () => {
    const { s, b } = fixture(),
      g = new RoadGraph();
    g.addRoad({
      start: { x: -300, z: 0 },
      end: { x: 300, z: 0 },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
    Object.assign(s, g.snapshot());
    s.nextId = 102;
    b.pos = { x: 0, z: 9 };
    const station = {
      ...structuredClone(b),
      id: 101,
      kind: 'service' as const,
      defId: 'police_station',
      pos: { x: -100, z: 9 },
      crime: 0,
    };
    s.buildings.push(station);
    const services = new ServiceSystem(s);
    services.update();
    s.clock.day = 1;
    updateCrime(s);
    expect(b.crime).toBeCloseTo(77.6);
    station.enabled = false;
    services.update();
    s.clock.day++;
    updateCrime(s);
    expect(b.crime).toBeCloseTo(78.1);
  });
  it('starts and resets the existing 40-day continuous crime abandonment deadline', () => {
    const { s, b } = fixture();
    b.crime = 80;
    updateProblems(s);
    s.clock.ticks = 39 * TIME.ticksPerDay;
    updateProblems(s);
    expect(b.state).toBe('active');
    b.crime = 79.9;
    updateProblems(s);
    expect(b.problemSinceTick?.crime).toBeUndefined();
    b.crime = 80;
    updateProblems(s);
    s.clock.ticks = 79 * TIME.ticksPerDay;
    updateProblems(s);
    expect(b.state).toBe('abandoned');
  });
  it('round trips the daily guard and rejects invalid rates/dates while keeping older files loadable', async () => {
    const { s, b } = fixture();
    s.clock.day = 1;
    s.clock.ticks = 10;
    updateCrime(s);
    const loaded = await deserialize(await serialize(s));
    expect(loaded.buildings[0]!.crime).toBe(80);
    expect(updateCrime({ ...loaded, terrain: s.terrain })).toEqual([]);
    for (const patch of [
      { crime: 101 },
      { crime: -1 },
      { crimeUpdatedDay: 2 },
      { crimeUpdatedDay: 0.5 },
    ]) {
      const bad = structuredClone(s);
      Object.assign(bad.buildings[0]!, patch);
      expect(() => migrateSave(bad, 1)).toThrow();
    }
    delete b.crime;
    delete b.crimeUpdatedDay;
    expect(() => migrateSave(s, 1)).not.toThrow();
  });
});
