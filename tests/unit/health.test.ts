import { describe, expect, it } from 'vitest';
import type { Building } from '../../src/world/types';
import { createState } from '../../src/sim/state';
import { updatePopulation } from '../../src/sim/systems/population';
import { updateHealth } from '../../src/sim/systems/health';
import { updateProblems } from '../../src/sim/systems/problems';
import { initialHousing } from '../../src/world/population';
import { fieldIndex } from '../../src/world/fieldSampling';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { buildingProblemIcons } from '../../src/world/buildingProblems';
import { ServiceSystem } from '../../src/sim/systems/services';
import { RoadGraph } from '../../src/world/roadGraph';
import { deserialize, serialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import { removeCitizen } from '../../src/world/citizens';
function fixture() {
  const s = createState({
      seed: 72,
      mapId: 'valley',
      mode: 'sandbox',
      cityName: 'Health',
    }),
    base = districtFixture(1)[0]!;
  const b: Building = {
    ...structuredClone(base),
    id: 10001,
    defId: 'RH',
    level: 5,
    lotW: 4,
    lotD: 4,
    state: 'active' as const,
    rotation: 0,
    pos: { x: 80, z: 9 },
    residents: 10,
    households: 2,
    flags: 7,
  };
  b.housing = initialHousing(b, 90);
  s.buildings = [b];
  s.nextId = 10010;
  updatePopulation(s);
  s.citizens.health.fill(50);
  updateHealth(s);
  const day = (n = 1) => {
    s.clock.day += n;
    s.clock.ticks = s.clock.day * 10;
    updateHealth(s, true);
  };
  return { s, b, day };
}
describe('resident health and healthcare', () => {
  it('recomputes shared home policy multipliers without altering individual health', () => {
    const f = fixture(),
      c = f.s.citizens;
    const before = c.health.slice();
    f.s.policies = ['smoking_ban'];
    updateHealth(f.s);
    expect(f.b.health!.average).toBeCloseTo(55);
    expect(c.health).toEqual(before);
    f.s.policies = [];
    updateHealth(f.s);
    expect(f.b.health!.average).toBe(50);
  });
  it('samples the centred map at edges and at its 16 metre cells', () => {
    expect(fieldIndex({ x: -2400, z: -2400 }, 300)).toBe(0);
    expect(fieldIndex({ x: 2400, z: 2400 }, 300)).toBe(89999);
    expect(fieldIndex({ x: 0, z: 0 }, 300)).toBe(45150);
    expect(fieldIndex({ x: -2383, z: -2400 }, 300)).toBe(1);
  });
  it('pollution reduces each real resident and clinic coverage recovers them, once per day', () => {
    const f = fixture();
    f.s.fields.pollution.fill(50);
    f.day();
    expect(f.b.health!.average).toBe(48);
    updateHealth(f.s, true);
    expect(f.b.health!.average).toBe(48);
    f.b.coverage = { health: 1 };
    f.day();
    expect(f.b.health!.average).toBe(50);
    updateHealth(f.s);
    expect(f.b.health!.average).toBe(50);
  });
  it('accumulates weak coverage and light pollution in hundredths without truncation', () => {
    const f = fixture();
    f.b.coverage = { health: 0.01 };
    for (let i = 0; i < 25; i++) f.day();
    expect(f.b.health!.average).toBeCloseTo(51);
    f.b.coverage = {};
    f.s.fields.pollution.fill(1);
    f.day();
    expect(f.b.health!.average).toBeCloseTo(50.96);
    expect(f.s.citizens.health[0]).toBe(50);
    expect(f.s.citizens.healthFraction[0]).toBe(96);
    f.s.citizens.healthFraction[1] = 70;
    const last = f.s.citizens.count - 1;
    f.s.citizens.healthFraction[last] = 42;
    removeCitizen(f.s.citizens, 1);
    expect(f.s.citizens.healthFraction[1]).toBe(42);
  });
  it('uses actual along-road clinic coverage and stops healing when the clinic is disabled', () => {
    const f = fixture(),
      g = new RoadGraph();
    g.addRoad({
      start: { x: -200, z: 0 },
      end: { x: 200, z: 0 },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
    Object.assign(f.s, g.snapshot());
    f.s.nextId = 10010;
    const clinic = {
      ...structuredClone(f.b),
      id: 10002,
      kind: 'service' as const,
      defId: 'clinic',
      pos: { x: 0, z: 9 },
      residents: 0,
      households: 0,
      housing: undefined,
      enabled: true,
    };
    f.s.buildings.push(clinic);
    const service = new ServiceSystem(f.s);
    service.update();
    expect(f.b.coverage!.health).toBeCloseTo(0.84);
    f.s.fields.pollution.fill(50);
    f.day();
    expect(f.b.health!.average).toBeCloseTo(51.36);
    clinic.enabled = false;
    service.update();
    f.day();
    expect(f.b.health!.average).toBeCloseTo(49.36);
  });
  it('shows sickness above 30%, resets the 40-day timer after recovery, and clamps contaminated-water damage', () => {
    const f = fixture();
    f.s.citizens.health.fill(39);
    updateHealth(f.s);
    expect(buildingProblemIcons(f.b)).toContain('sickness');
    updateProblems(f.s);
    f.s.clock.day = 39;
    f.s.clock.ticks = 390;
    updateProblems(f.s);
    expect(f.b.state).toBe('active');
    f.b.coverage = { health: 1 };
    f.day();
    updateProblems(f.s);
    expect(f.b.problemTimers.sickness).toBe(0);
    expect(f.b.state).toBe('active');
    f.b.coverage = {};
    f.b.drinkingWaterPollution = 100;
    f.s.fields.pollution.fill(100);
    f.s.citizens.health.fill(1);
    f.day();
    expect(f.b.health!.average).toBe(0);
    f.b.drinkingWaterPollution = 0;
    f.s.fields.pollution.fill(0);
    f.b.coverage = { health: 1 };
    f.s.citizens.health.fill(99);
    f.day();
    expect(f.b.health!.average).toBe(100);
  });
  it('serializes fractional health and the daily guard, migrates old tables, and rejects invalid fractions/dates', async () => {
    const f = fixture();
    f.b.coverage = { health: 0.01 };
    f.day();
    const loaded = await deserialize(await serialize(f.s));
    expect(loaded.citizens.healthFraction[0]).toBe(4);
    expect(loaded.citizens.lastHealthDay).toBe(1);
    const bad = structuredClone(loaded);
    bad.citizens.healthFraction[0] = 100;
    expect(() => migrateSave(bad, 1)).toThrow();
    const badDay = structuredClone(loaded);
    badDay.citizens.lastHealthDay = 2;
    expect(() => migrateSave(badDay, 1)).toThrow();
    const old = structuredClone(loaded);
    delete (old.citizens as Partial<typeof old.citizens>).healthFraction;
    delete (old.citizens as Partial<typeof old.citizens>).lastHealthDay;
    const migrated = migrateSave(old, 1);
    expect(migrated.citizens.healthFraction[0]).toBe(0);
    expect(migrated.citizens.lastHealthDay).toBe(-1);
  });
  it('removes stale household summaries after demolition/displacement', () => {
    const f = fixture();
    expect(f.s.stats.health!.residents).toBe(10);
    f.b.state = 'burned';
    updatePopulation(f.s);
    updateHealth(f.s);
    expect(f.b.health!.residents).toBe(0);
    expect(f.s.stats.health!.residents).toBe(0);
  });
});

it('keeps each home recovery and fractional individual health separate in one update', () => {
  const { s, b, day } = fixture();
  const other = { ...structuredClone(b), id: b.id + 1, pos: { x: 160, z: 9 } };
  s.buildings.push(other);
  updatePopulation(s);
  b.coverage = { health: 0.01 };
  other.coverage = { health: 0.5 };
  for (let i = 0; i < s.citizens.count; i++) {
    s.citizens.health[i] = 40 + i;
    s.citizens.healthFraction[i] = i;
  }
  const before = s.citizens.health.slice(),
    fractions = s.citizens.healthFraction.slice();
  day();
  for (let i = 0; i < s.citizens.count; i++) {
    const gain = s.citizens.homeId[i] === b.id ? 4 : 200;
    expect(s.citizens.health[i]! * 100 + s.citizens.healthFraction[i]!).toBe(
      before[i]! * 100 + fractions[i]! + gain,
    );
  }
  const settled = s.citizens.health.slice();
  updateHealth(s, true);
  expect(s.citizens.health).toEqual(settled);
});
