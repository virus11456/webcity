import { expect, it } from 'vitest';
import { uniqueState } from '../fixtures/uniqueCity';
import { Simulation } from '../../src/sim/simulation';
import { UNIQUE_BUILDINGS } from '../../src/data/unique';
import { parkField } from '../../src/sim/systems/parks';
import { fieldIndex } from '../../src/world/fieldSampling';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import { BUILDINGS } from '../../src/data/buildings';
it.each(UNIQUE_BUILDINGS)(
  '$id requires its milestone and civic prerequisite and applies a reversible effect',
  async (d) => {
    const s = uniqueState();
    s.unlocked = [0];
    let sim = new Simulation(s.settings, undefined, s);
    expect(sim.place(d.id, { x: 0, z: 9 }, 0).reason).toBe('err.powerLocked');
    s.unlocked = uniqueState().unlocked;
    s.buildings = s.buildings.filter((b) => b.kind === 'zoned');
    sim = new Simulation(s.settings, undefined, s);
    expect(sim.place(d.id, { x: 0, z: 9 }, 0).reason).toBe(
      'err.uniqueRequires',
    );
    const prereq = BUILDINGS.find((v) => v.id === d.requires)!;
    s.buildings.push({
      ...structuredClone(s.buildings[0]!),
      id: 10008,
      defId: d.requires,
      kind: prereq.kind,
      pos: { x: -150, z: 9 },
      lotW: prereq.footprintCells![0],
      lotD: prereq.footprintCells![1],
      enabled: false,
    });
    sim = new Simulation(s.settings, undefined, s);
    expect(sim.place(d.id, { x: 0, z: 9 }, 0).reason).toBe(
      'err.uniqueRequires',
    );
    s.buildings[1]!.enabled = true;
    sim = new Simulation(s.settings, undefined, s);
    const before = sim.snapshot(),
      base = before.buildings[0]!.landValue!;
    expect(sim.place(d.id, { x: 0, z: 9 }, 0)).toMatchObject({
      ok: true,
      cost: d.cost,
    });
    const placed = sim.snapshot(),
      landmark = placed.buildings.find((b) => b.defId === d.id)!;
    expect(landmark.kind).toBe('unique');
    expect(placed.money).toBe(before.money - d.cost);
    expect(placed.buildings[0]!.landValue).toBeGreaterThan(base);
    expect(sim.place(d.id, { x: 300, z: 9 }, 0).reason).toBe(
      'err.uniqueExists',
    );
    expect(sim.snapshot().money).toBe(placed.money);
    sim.setBuildingEnabled(landmark.id, false);
    expect(sim.snapshot().buildings[0]!.landValue).toBeCloseTo(base);
    expect(sim.place(d.id, { x: 300, z: 9 }, 0).reason).toBe(
      'err.uniqueExists',
    );
    sim.setBuildingEnabled(landmark.id, true);
    const restored = await deserialize(await serialize(sim.snapshot()));
    expect(restored.buildings.find((b) => b.defId === d.id)).toMatchObject({
      kind: 'unique',
      paidCost: d.cost,
    });
    const resumed = new Simulation(restored.settings, undefined, restored);
    expect(resumed.place(d.id, { x: 300, z: 9 }, 0).reason).toBe(
      'err.uniqueExists',
    );
    expect(resumed.bulldoze([{ kind: 'building', id: landmark.id }]).ok).toBe(
      true,
    );
    expect(resumed.place(d.id, { x: 0, z: 9 }, 0).ok).toBe(true);
  },
);
it('enforces funds and uniqueness in sandbox and rejects duplicate saved landmarks', () => {
  const s = uniqueState();
  s.money = 1;
  let sim = new Simulation(s.settings, undefined, s);
  expect(sim.place('unique_city_hall', { x: 0, z: 9 }, 0).reason).toBe(
    'err.notEnoughMoney',
  );
  s.settings.mode = 'sandbox';
  s.unlocked = [0];
  s.buildings = [];
  sim = new Simulation(s.settings, undefined, s);
  expect(sim.place('unique_sky_tower', { x: 0, z: 9 }, 0)).toMatchObject({
    ok: true,
    cost: 0,
  });
  expect(sim.place('unique_sky_tower', { x: 300, z: 9 }, 0).reason).toBe(
    'err.uniqueExists',
  );
  const saved = sim.snapshot();
  saved.buildings.push({ ...saved.buildings[0]!, id: 10009 });
  expect(() => migrateSave(saved, 1)).toThrow();
});
it('scales the land-value source with the parks budget and removes burned effects', () => {
  const s = uniqueState(),
    sim = new Simulation(s.settings, undefined, s);
  sim.place('unique_city_hall', { x: 0, z: 9 }, 0);
  const placed = Object.assign(uniqueState(), sim.snapshot(), {
      terrain: s.terrain,
    }),
    field = fieldIndex({ x: 0, z: 33 }, placed.fields.size);
  const full = parkField(placed)[field]!;
  expect(full).toBeGreaterThan(20);
  placed.budgets.parks = 0.5;
  expect(parkField(placed)[field]).toBeLessThan(full / 2);
  placed.buildings.find((b) => b.kind === 'unique')!.state = 'burned';
  expect(parkField(placed)[field]).toBe(0);
});
