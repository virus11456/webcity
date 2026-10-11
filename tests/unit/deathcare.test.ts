import { updatePopulation } from '../../src/sim/systems/population';
import { citizenSystem } from '../../src/sim/systems/citizens';
import { initialHousing } from '../../src/world/population';
import { describe, it, expect } from 'vitest';
import { deathcareState } from '../fixtures/deathcareCity';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { DeathcareSystem } from '../../src/sim/systems/deathcare';
import { deathcareCapacity } from '../../src/world/deathcare';
import { hasBuildingProblem } from '../../src/world/buildingProblems';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import type { WorldSnapshot } from '../../src/world/snapshot';
import { CityNotices } from '../../src/ui/cityNotices';
import { Simulation } from '../../src/sim/simulation';
function fixture(restored?: WorldSnapshot) {
  const { s, roads } = deathcareState();
  if (restored) {
    const terrain = s.terrain;
    Object.assign(terrain, restored.terrain);
    Object.assign(s, structuredClone(restored), { terrain });
  }
  const lanes = new LaneGraph();
  lanes.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, lanes, schedules),
    traffic = new TrafficSystem(
      s,
      lanes,
      planner,
      schedules,
      restored?.traffic,
    ),
    deathcare = new DeathcareSystem(s, planner, traffic);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      s.clock.ticks++;
      s.clock.day = Math.floor(s.clock.ticks / 10);
      s.clock.tickInDay = s.clock.ticks % 10;
      traffic.step(0.24);
      deathcare.tick();
    }
  };
  const network = () => {
    Object.assign(s, roads.snapshot());
    s.nextId = 10010;
    lanes.sync(s.nodes, s.segments);
    traffic.networkChanged();
  };
  return {
    s,
    roads,
    lanes,
    traffic,
    deathcare,
    step,
    network,
    facility: s.buildings[0]!,
    home: s.buildings[1]!,
  };
}
describe('physical deathcare collection', () => {
  it('preserves the rotating target cursor while no facility exists, then uses newly added facilities', () => {
    const f = fixture();
    const second = { ...structuredClone(f.home), id: 10020 };
    const third = { ...structuredClone(f.home), id: 10021 };
    f.s.buildings = [f.home, second];
    f.deathcare.tick();
    expect(f.s.deathcare.missions).toHaveLength(0);
    f.facility.pos.x = 100; // Reduced budget also reduces the cemetery service radius.
    f.s.buildings.push(third, f.facility);
    f.s.budgets.deathcare = 1 / 4;
    f.deathcare.tick();
    expect(f.s.deathcare.missions).toHaveLength(1);
    expect(f.s.deathcare.missions[0]!.to).toBe(third.id);
  });
  it('reserves fleet and storage between targets and uses the next equal-distance provider by ID', () => {
    const f = fixture();
    const other = { ...structuredClone(f.facility), id: 10030 };
    f.facility.mortuary!.stock = 2000 - 1;
    other.mortuary!.stock = 2000 - 1;
    f.s.buildings = [
      other,
      f.home,
      f.facility,
      ...Array.from({ length: 5 }, (_, i) => ({
        ...structuredClone(f.home),
        id: 10040 + i,
      })),
    ];
    f.deathcare.tick();
    expect(f.s.deathcare.missions.map((m) => m.from)).toEqual([
      f.facility.id,
      other.id,
    ]);
    expect(f.s.deathcare.missions.every((m) => m.units === 1)).toBe(true);
    f.deathcare.tick();
    expect(f.s.deathcare.missions).toHaveLength(2);
  });
  it('counts both collection and returning reservations, then releases them after depot removal', () => {
    const f = fixture();
    f.facility.mortuary!.stock = 2000 - 2;
    f.s.buildings.push({ ...structuredClone(f.home), id: 10020 });
    f.deathcare.tick();
    expect(f.s.deathcare.missions).toHaveLength(2);
    f.s.deathcare.missions[0]!.phase = 'return';
    f.s.buildings.push({ ...structuredClone(f.home), id: 10021 });
    f.deathcare.tick();
    expect(f.s.deathcare.missions).toHaveLength(2);
    f.s.buildings = f.s.buildings.filter((b) => b.id !== f.facility.id);
    f.deathcare.tick();
    expect(f.s.deathcare.missions).toHaveLength(0);
    const replacement = { ...structuredClone(f.facility), id: 10022 };
    replacement.mortuary!.stock = 0;
    f.s.buildings.push(replacement);
    f.deathcare.tick();
    expect(f.s.deathcare.missions.length).toBeGreaterThan(0);
    expect(f.s.deathcare.missions.every((m) => m.from === replacement.id)).toBe(
      true,
    );
  });

  it('records actual deaths once at the home after MS2, while emigrants and pre-unlock deaths create no demand', () => {
    for (const unlocked of [false, true]) {
      const { s } = deathcareState();
      const home = s.buildings[1]!;
      s.settings.mode = 'normal';
      s.unlocked = unlocked ? [0, 1, 2] : [0, 1];
      home.bodies = { pending: 0 };
      home.residents = 3;
      home.households = 1;
      home.housing = initialHousing(home, 1);
      updatePopulation(s);
      const count = s.citizens.count;
      expect(count).toBeGreaterThan(0);
      s.citizens.age.fill(99, 0, count);
      s.citizens.bornDay.fill(0);
      s.clock.day = 30;
      expect(citizenSystem(s).daily().deaths).toBe(count);
      expect(home.bodies.pending).toBe(unlocked ? count : 0);
      citizenSystem(s).daily();
      expect(home.bodies.pending).toBe(unlocked ? count : 0);
    }
    const { s } = deathcareState();
    const home = s.buildings[1]!;
    home.bodies = { pending: 0 };
    home.residents = 3;
    home.households = 1;
    home.housing = initialHousing(home, 1);
    updatePopulation(s);
    home.housing.sizes.fill(0);
    updatePopulation(s);
    expect(s.citizens.count).toBe(0);
    expect(home.bodies.pending).toBe(0);
  });
  it('keeps unserved demand with no facility or no road and resumes service when a connection returns', () => {
    const f = fixture();
    const facility = f.facility;
    f.s.buildings = [f.home];
    f.step(50);
    expect(f.home.bodies!.pending).toBe(3);
    f.s.buildings.unshift(facility);
    facility.mortuary!.stock = 2000;
    f.step(50);
    expect(f.home.bodies!.pending).toBe(3);
    facility.defId = 'crematorium';
    facility.mortuary!.stock = 200;
    f.step(50);
    expect(f.home.bodies!.pending).toBe(3);
    f.deathcare.daily();
    expect(facility.mortuary!.stock).toBe(100);
    f.step(800);
    expect(f.home.bodies!.pending).toBe(0);
    expect(facility.mortuary!.stock).toBe(103);
  });

  it('keeps bodies at home until pickup, then retains truck load until it returns to the depot', () => {
    const f = fixture();
    expect(hasBuildingProblem(f.home, 'deathcare')).toBe(true);
    f.deathcare.tick();
    expect(f.home.bodies!.pending).toBe(3);
    expect(f.facility.mortuary!.stock).toBe(0);
    expect(f.traffic.snapshot().vehicles[0]!.kind).toBe(7);
    for (
      let i = 0;
      i < 200 && !f.s.deathcare.missions.some((m) => m.phase === 'return');
      i++
    )
      f.step();
    expect(
      f.s.deathcare.missions.find((m) => m.phase === 'return')?.units,
    ).toBe(1);
    expect(f.home.bodies!.pending).toBe(2);
    expect(f.facility.mortuary!.stock).toBe(0);
    f.step(800);
    expect(f.home.bodies!.pending).toBe(0);
    expect(f.facility.mortuary!.stock).toBe(3);
    expect(f.s.deathcare.missions).toHaveLength(0);
    expect(f.facility.mortuary!.vehicles).toBe(0);
  });
  it('reserves storage before dispatch so concurrent trips never overfill a cemetery, and raises a warning at capacity', () => {
    const f = fixture();
    f.facility.mortuary!.stock = 1999;
    f.deathcare.tick();
    expect(f.s.deathcare.missions[0]!.units).toBe(1);
    f.step(350);
    expect(f.facility.mortuary!.stock).toBe(2000);
    expect(f.home.bodies!.pending).toBe(2);
    expect(f.facility.mortuary!.full).toBe(true);
    expect(hasBuildingProblem(f.facility, 'deathcare')).toBe(true);
    expect(f.s.deathcare.missions).toHaveLength(0);
    const notices = new CityNotices().accept({
      t: 'ready',
      reqId: 1,
      snapshot: { ...f.s, traffic: f.traffic.snapshot() },
    });
    expect(notices.some((n) => n.code === 'deathcare')).toBe(true);
  });
  it('parks a loaded truck after road removal, preserves its cargo, and returns after repair', () => {
    const f = fixture();
    f.home.bodies!.pending = 1;
    f.deathcare.tick();
    for (
      let i = 0;
      i < 200 && !f.s.deathcare.missions.some((m) => m.phase === 'return');
      i++
    )
      f.step();
    const id = f.s.deathcare.missions[0]!.id;
    f.roads.removeSegment(f.s.segments[0]!.id);
    f.network();
    f.step(40);
    expect(f.traffic.strandedMission(id)).toBeDefined();
    expect(f.s.deathcare.missions[0]!.units).toBe(1);
    expect(f.facility.mortuary!.stock).toBe(0);
    f.roads.addRoad({
      start: { x: -400, z: 0 },
      end: { x: 400, z: 0 },
      type: 'road_small',
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
    f.network();
    f.step(350);
    expect(f.facility.mortuary!.stock).toBe(1);
  });
  it('does not dispatch when disabled, disconnected, or full and honors the budget fleet limit', () => {
    const f = fixture();
    f.facility.enabled = false;
    f.deathcare.tick();
    expect(f.s.deathcare.missions).toHaveLength(0);
    f.facility.enabled = true;
    f.facility.pos.z = 800;
    f.deathcare.tick();
    expect(f.s.deathcare.missions).toHaveLength(0);
    f.facility.pos.z = 9;
    f.s.buildings.push(
      ...Array.from({ length: 10 }, (_, i) => ({
        ...structuredClone(f.home),
        id: 10020 + i,
        pos: { x: -100 + i * 5, z: 9 },
      })),
    );
    f.s.nextId = 10040;
    f.s.budgets.deathcare = 0.5;
    f.step(5);
    expect(f.s.deathcare.missions).toHaveLength(2);
  });
  it.each(['crematorium'])(
    '%s processes only actual delivered stock once per day without consuming cemetery plots',
    (id) => {
      const f = fixture();
      f.facility.defId = id;
      f.facility.mortuary!.stock = deathcareCapacity(f.facility);
      f.s.budgets.deathcare = 0.5;
      f.deathcare.daily();
      expect(f.facility.mortuary!.processedToday).toBe(50);
      expect(f.facility.mortuary!.stock).toBe(150);
      f.deathcare.daily();
      expect(f.s.deathcare.processed).toBe(50);
      f.facility.enabled = false;
      f.s.clock.day++;
      f.deathcare.daily();
      expect(f.facility.mortuary!.processedToday).toBe(0);
    },
  );
  it('preserves a moving round trip and reserved space through save/load and rejects corrupt missions', async () => {
    const f = fixture();
    f.home.bodies!.pending = 1;
    f.deathcare.tick();
    f.step(5);
    const saved = await deserialize(
      await serialize({ ...f.s, traffic: f.traffic.snapshot() }),
    );
    const restored = fixture(saved);
    restored.step(350);
    expect(restored.facility.mortuary!.stock).toBe(1);
    expect(restored.home.bodies!.pending).toBe(0);
    const corrupt = structuredClone(saved);
    corrupt.deathcare.missions[0]!.units = 2001;
    expect(() => migrateSave(corrupt, 1)).toThrow();
    const nullFacility = structuredClone(saved);
    Reflect.set(nullFacility.buildings[0]!, 'mortuary', null);
    expect(() => migrateSave(nullFacility, 1)).toThrow();
    const invalidBody = structuredClone(saved);
    invalidBody.buildings[1]!.bodies!.pending = 0.5;
    expect(() => migrateSave(invalidBody, 1)).toThrow();
    const old = structuredClone(saved);
    old.deathcare.missions = [];
    old.traffic.vehicles = [];
    old.traffic.routes = [];
    Reflect.deleteProperty(old, 'deathcare');
    expect(migrateSave(old, 1).deathcare.missions).toEqual([]);
  });
  it('cancels a demolished depot without silently losing its loaded body', () => {
    const f = fixture();
    f.home.bodies!.pending = 1;
    f.deathcare.tick();
    for (
      let i = 0;
      i < 200 && !f.s.deathcare.missions.some((m) => m.phase === 'return');
      i++
    )
      f.step();
    f.s.buildings = f.s.buildings.filter((b) => b.id !== f.facility.id);
    f.deathcare.reconcile();
    expect(f.home.bodies!.pending).toBe(1);
    expect(f.s.deathcare.missions).toHaveLength(0);
    expect(f.s.deathcare.lost).toBe(0);
  });
  it('requires MS2 and road access to place a cemetery using the normal building command', () => {
    const { s } = deathcareState();
    s.buildings = [];
    s.settings.mode = 'normal';
    s.unlocked = [0];
    s.money = 10000;
    const sim = new Simulation(s.settings, undefined, s);
    expect(sim.place('cemetery', { x: 0, z: 9 }, 0).ok).toBe(false);
    s.unlocked.push(2);
    const unlocked = new Simulation(s.settings, undefined, s);
    expect(unlocked.place('cemetery', { x: 0, z: 9 }, 0)).toMatchObject({
      ok: true,
      cost: 3000,
    });
    expect(unlocked.snapshot().buildings[0]!.mortuary!.stock).toBe(0);
  });
});
