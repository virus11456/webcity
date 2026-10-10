import { initialHousing } from '../../src/world/population';
import { createState } from '../../src/sim/state';
import { levelsState } from '../fixtures/levelsCity';
import { Simulation } from '../../src/sim/simulation';
import { describe, it, expect } from 'vitest';
import { environmentState } from '../fixtures/environmentCity';
import {
  buildingHappiness,
  updateHappiness,
} from '../../src/sim/systems/happiness';
import { updateLevels } from '../../src/sim/systems/levels';
import { updatePopulation } from '../../src/sim/systems/population';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
function fixture() {
  const s = environmentState(),
    b = s.buildings[0]!;
  b.flags = 7;
  b.landValue = 100;
  b.builtDay = 0;
  b.housing!.averageEducation = 3;
  return { s, b };
}
describe('happiness and building development', () => {
  it('real powered and watered park district reaches Lv5 and replay preserves development', () => {
    const saved = levelsState();
    const sim = new Simulation(saved.settings, undefined, saved);
    sim.setSpeed(4);
    for (let i = 0; i < 200; i++) sim.tick();
    const middle = sim.snapshot(),
      restored = new Simulation(middle.settings, undefined, middle);
    for (let i = 0; i < 200; i++) {
      sim.tick();
      restored.tick();
    }
    const home = sim.snapshot().buildings[0]!;
    expect(home.level).toBe(5);
    expect(home.happiness).toBeGreaterThan(70);
    expect(restored.snapshot().buildings[0]!.development).toEqual(
      home.development,
    );
  });
  it('uses utility penalties, services, parks, pollution, crime and percentage point tax', () => {
    const { b } = fixture();
    expect(buildingHappiness(b, 9)).toBe(50);
    b.coverage = { police: 1, fire: 1, health: 1, education: 1 };
    b.parkBonus = 20;
    b.environment = { pollution: 10, noise: 20, waterPollution: 0 };
    b.crime = 10;
    expect(buildingHappiness(b, 12)).toBe(66.5);
    b.flags = 0;
    b.coverage.garbage = 0;
    expect(buildingHappiness(b, 12)).toBe(0);
    b.flags = 7;
    b.parkBonus = 1000;
    expect(buildingHappiness(b, 9)).toBe(100);
  });
  it('uses each home happiness for migration instead of hiding a deprived neighborhood in the city average', () => {
    const { s: previous, b } = fixture();
    const s = createState(previous.settings);
    b.residents = 0;
    b.housing = initialHousing(b, 2);
    b.happiness = 0;
    const happy = {
      ...structuredClone(b),
      id: 50000,
      happiness: 80,
      pos: { x: 89, z: 64 },
    };
    s.buildings = [b, happy];
    s.stats.population = 0;
    s.stats.happiness = 80;
    s.clock.day = 1;
    updatePopulation(s, true);
    expect(b.residents).toBe(0);
    expect(happy.residents).toBeGreaterThan(0);
  });
  it('weights city happiness by people and writes individual home happiness', () => {
    const { s, b } = fixture();
    const other = { ...structuredClone(b), id: 50000, residents: 30, flags: 0 };
    s.buildings = [b, other];
    s.citizens.homeId[0] = other.id;
    updateHappiness(s);
    expect(s.stats.happiness).toBe(12.5);
    expect(s.citizens.happiness[0]).toBe(0);
    expect(s.citizens.happiness[1]).toBe(50);
    s.policies = ['smoking_ban', 'pet_ban'];
    updateHappiness(s);
    expect(b.happiness).toBe(47);
    expect(s.citizens.happiness[1]).toBe(47);
  });
  it('progressively upgrades residential through Lv5, one step per 10 days; repeats and pause do nothing', () => {
    const { s, b } = fixture();
    for (let day = 0; day <= 50; day++) {
      s.clock.day = day;
      updateLevels(s, true);
      updateLevels(s, true);
      expect(b.level).toBe(Math.min(5, 1 + Math.floor(day / 10)));
    }
    expect(b.upgrade!.target).toBe(5);
    s.clock.day = 100;
    updateLevels(s);
    expect(b.level).toBe(5);
  });
  it('requires every next-level condition and caps workplaces at Lv3 using actual employee education', () => {
    const { s, b } = fixture();
    b.defId = 'I';
    b.workerEducation = [0, 0, 10, 0];
    b.landValue = 20;
    s.clock.day = 10;
    updateLevels(s, true);
    expect(b.level).toBe(1);
    b.landValue = 100;
    b.flags = 0;
    s.clock.day = 20;
    updateLevels(s, true);
    expect(b.level).toBe(1);
    b.flags = 7;
    b.coverage = { garbage: 0 };
    s.clock.day = 30;
    updateLevels(s, true);
    expect(b.level).toBe(1);
    b.coverage.garbage = 1;
    b.workerEducation = [10, 0, 0, 0];
    s.clock.day = 40;
    updateLevels(s, true);
    expect(b.level).toBe(1);
    b.workerEducation = [0, 0, 10, 0];
    s.clock.day = 50;
    updateLevels(s, true);
    expect(b.level).toBe(2);
    s.clock.day = 60;
    updateLevels(s, true);
    expect(b.level).toBe(3);
    s.clock.day = 70;
    updateLevels(s, true);
    expect(b.level).toBe(3);
  });
  it('downgrades only after 30 continuous low-value days and recovery resets the countdown', async () => {
    const { s, b } = fixture();
    b.level = 5;
    b.landValue = 70;
    for (let d = 1; d <= 20; d++) {
      s.clock.day = d;
      updateLevels(s, true);
    }
    b.landValue = 71;
    s.clock.day = 21;
    updateLevels(s, true);
    expect(b.development!.lowValueSinceDay).toBeUndefined();
    b.landValue = 0;
    s.clock.day = 22;
    updateLevels(s, true);
    const copy = Object.assign(
      environmentState(),
      await deserialize(await serialize(s)),
    );
    for (let d = 23; d <= 51; d++) {
      s.clock.day = copy.clock.day = d;
      updateLevels(s, true);
      updateLevels(copy, true);
    }
    expect(b.level).toBe(5);
    s.clock.day = copy.clock.day = 52;
    updateLevels(s, true);
    updateLevels(copy, true);
    expect(b.level).toBe(4);
    expect(copy.buildings[0]!.development).toEqual(b.development);
    s.clock.day = 53;
    updateLevels(s, true);
    expect(b.level).toBe(4);
  });
  it('reconciles real capacity after levels change and validates stored progress', () => {
    const { s, b } = fixture();
    b.defId = 'RH';
    b.lotW = b.lotD = 4;
    updatePopulation(s);
    const initial = b.households;
    b.housing!.averageEducation = 3;
    s.clock.day = 10;
    updateLevels(s, true);
    updatePopulation(s);
    expect(b.households).toBeGreaterThan(initial);
    b.upgrade!.progress = NaN;
    expect(() => migrateSave(s, 1)).toThrow();
  });
});
