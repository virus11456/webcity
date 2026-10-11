import { describe, it, expect } from 'vitest';
import { garbageState } from '../fixtures/garbageCity';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { GarbageSystem } from '../../src/sim/systems/garbage';
import { garbageCapacity, incineratorOutput } from '../../src/world/garbage';
import { hasBuildingProblem } from '../../src/world/buildingProblems';
import { garbageCollected } from '../../src/sim/systems/happiness';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import type { WorldSnapshot } from '../../src/world/snapshot';
import { CityNotices } from '../../src/ui/cityNotices';
import { Simulation } from '../../src/sim/simulation';
function fixture(restored?: WorldSnapshot) {
  const { s, roads } = garbageState();
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
    garbage = new GarbageSystem(s, planner, traffic);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      s.clock.ticks++;
      s.clock.day = Math.floor(s.clock.ticks / 10);
      s.clock.tickInDay = s.clock.ticks % 10;
      traffic.step(0.24);
      garbage.tick();
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
    garbage,
    step,
    network,
    facility: s.buildings[0]!,
    home: s.buildings[1]!,
  };
}
describe('physical garbage collection', () => {
  it('preserves the rotating target cursor while no facility exists, then uses newly added facilities', () => {
    const f = fixture();
    const second = { ...structuredClone(f.home), id: 10020 };
    const third = { ...structuredClone(f.home), id: 10021 };
    f.s.buildings = [f.home, second];
    f.garbage.tick();
    expect(f.s.garbage.missions).toHaveLength(0);
    f.s.buildings.push(third, f.facility);
    f.s.budgets.garbage = 1 / 6;
    f.garbage.tick();
    expect(f.s.garbage.missions).toHaveLength(1);
    expect(f.s.garbage.missions[0]!.to).toBe(third.id);
  });
  it('reserves fleet and storage between targets and uses the next equal-distance provider by ID', () => {
    const f = fixture();
    const other = { ...structuredClone(f.facility), id: 10030 };
    f.facility.wasteFacility!.stock = 80000 - 100;
    other.wasteFacility!.stock = 80000 - 100;
    f.s.buildings = [
      other,
      f.home,
      f.facility,
      ...Array.from({ length: 5 }, (_, i) => ({
        ...structuredClone(f.home),
        id: 10040 + i,
      })),
    ];
    f.garbage.tick();
    expect(f.s.garbage.missions.map((m) => m.from)).toEqual([
      f.facility.id,
      other.id,
    ]);
    expect(f.s.garbage.missions.every((m) => m.units === 100)).toBe(true);
    f.garbage.tick();
    expect(f.s.garbage.missions).toHaveLength(2);
  });
  it('counts both collection and returning reservations, then releases them after depot removal', () => {
    const f = fixture();
    f.facility.wasteFacility!.stock = 80000 - 200;
    f.s.buildings.push({ ...structuredClone(f.home), id: 10020 });
    f.garbage.tick();
    expect(f.s.garbage.missions).toHaveLength(2);
    f.s.garbage.missions[0]!.phase = 'return';
    f.s.buildings.push({ ...structuredClone(f.home), id: 10021 });
    f.garbage.tick();
    expect(f.s.garbage.missions).toHaveLength(2);
    f.s.buildings = f.s.buildings.filter((b) => b.id !== f.facility.id);
    f.garbage.tick();
    expect(f.s.garbage.missions).toHaveLength(0);
    const replacement = { ...structuredClone(f.facility), id: 10022 };
    replacement.wasteFacility!.stock = 0;
    f.s.buildings.push(replacement);
    f.garbage.tick();
    expect(f.s.garbage.missions.length).toBeGreaterThan(0);
    expect(f.s.garbage.missions.every((m) => m.from === replacement.id)).toBe(
      true,
    );
  });

  it('keeps garbage until pickup, then retains truck load until it returns to the depot', () => {
    const f = fixture();
    expect(hasBuildingProblem(f.home, 'garbage')).toBe(true);
    expect(garbageCollected(f.home)).toBe(false);
    f.garbage.tick();
    expect(f.home.garbage!.stock).toBe(250);
    expect(f.facility.wasteFacility!.stock).toBe(0);
    expect(f.traffic.snapshot().vehicles[0]!.kind).toBe(6);
    for (
      let i = 0;
      i < 200 && !f.s.garbage.missions.some((m) => m.phase === 'return');
      i++
    )
      f.step();
    expect(f.s.garbage.missions.find((m) => m.phase === 'return')?.units).toBe(
      100,
    );
    expect(f.home.garbage!.stock).toBe(150);
    expect(f.facility.wasteFacility!.stock).toBe(0);
    f.step(350);
    expect(f.home.garbage!.stock).toBe(0);
    expect(f.facility.wasteFacility!.stock).toBe(250);
    expect(f.s.garbage.missions).toHaveLength(0);
    expect(f.facility.wasteFacility!.vehicles).toBe(0);
    expect(garbageCollected(f.home)).toBe(true);
  });
  it('reserves storage before dispatch so concurrent trips never overfill a landfill, and raises a warning at capacity', () => {
    const f = fixture();
    f.facility.wasteFacility!.stock = 79960;
    f.garbage.tick();
    expect(f.s.garbage.missions[0]!.units).toBe(40);
    f.step(350);
    expect(f.facility.wasteFacility!.stock).toBe(80000);
    expect(f.home.garbage!.stock).toBe(210);
    expect(f.facility.wasteFacility!.full).toBe(true);
    expect(hasBuildingProblem(f.facility, 'garbage')).toBe(true);
    expect(f.s.garbage.missions).toHaveLength(0);
    const notices = new CityNotices().accept({
      t: 'ready',
      reqId: 1,
      snapshot: { ...f.s, traffic: f.traffic.snapshot() },
    });
    expect(notices.some((n) => n.code === 'garbage')).toBe(true);
  });
  it('parks a loaded truck after road removal, preserves its cargo, and returns after repair', () => {
    const f = fixture();
    f.home.garbage!.stock = 100;
    f.garbage.tick();
    for (
      let i = 0;
      i < 200 && !f.s.garbage.missions.some((m) => m.phase === 'return');
      i++
    )
      f.step();
    const id = f.s.garbage.missions[0]!.id;
    f.roads.removeSegment(f.s.segments[0]!.id);
    f.network();
    f.step(40);
    expect(f.traffic.strandedMission(id)).toBeDefined();
    expect(f.s.garbage.missions[0]!.units).toBe(100);
    expect(f.facility.wasteFacility!.stock).toBe(0);
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
    expect(f.facility.wasteFacility!.stock).toBe(100);
  });
  it('does not dispatch when disabled, disconnected, or full and honors the budget fleet limit', () => {
    const f = fixture();
    f.facility.enabled = false;
    f.garbage.tick();
    expect(f.s.garbage.missions).toHaveLength(0);
    f.facility.enabled = true;
    f.facility.pos.z = 800;
    f.garbage.tick();
    expect(f.s.garbage.missions).toHaveLength(0);
    f.facility.pos.z = 9;
    f.s.buildings.push(
      ...Array.from({ length: 10 }, (_, i) => ({
        ...structuredClone(f.home),
        id: 10020 + i,
        pos: { x: 100 + i * 15, z: 9 },
      })),
    );
    f.s.nextId = 10040;
    f.s.budgets.garbage = 0.5;
    f.step(5);
    expect(f.s.garbage.missions).toHaveLength(3);
  });
  it.each(['garbage_incinerator', 'garbage_recycling'])(
    '%s processes only actual delivered stock once per day and electricity needs burned waste',
    (id) => {
      const f = fixture();
      f.facility.defId = id;
      f.facility.wasteFacility!.stock = garbageCapacity(f.facility);
      f.s.budgets.garbage = 0.5;
      expect(incineratorOutput(f.facility)).toBe(0);
      f.garbage.daily();
      const processed = id === 'garbage_incinerator' ? 1000 : 500;
      expect(f.facility.wasteFacility!.processedToday).toBe(processed);
      expect(f.s.garbage.processed).toBe(processed);
      f.garbage.daily();
      expect(f.s.garbage.processed).toBe(processed);
      expect(incineratorOutput(f.facility)).toBe(
        id === 'garbage_incinerator' ? 4 : 0,
      );
      f.facility.enabled = false;
      expect(incineratorOutput(f.facility)).toBe(0);
      f.s.clock.day++;
      f.garbage.daily();
      expect(f.facility.wasteFacility!.processedToday).toBe(0);
    },
  );
  it('preserves a moving round trip and reserved space through save/load and rejects corrupt missions', async () => {
    const f = fixture();
    f.home.garbage!.stock = 100;
    f.garbage.tick();
    f.step(5);
    const saved = await deserialize(
      await serialize({ ...f.s, traffic: f.traffic.snapshot() }),
    );
    const restored = fixture(saved);
    restored.step(350);
    expect(restored.facility.wasteFacility!.stock).toBe(100);
    expect(restored.home.garbage!.stock).toBe(0);
    const corrupt = structuredClone(saved);
    corrupt.garbage.missions[0]!.units = 80001;
    expect(() => migrateSave(corrupt, 1)).toThrow();
    const old = structuredClone(saved);
    old.garbage.missions = [];
    old.traffic.vehicles = [];
    old.traffic.routes = [];
    Reflect.deleteProperty(old, 'garbage');
    expect(migrateSave(old, 1).garbage.missions).toEqual([]);
  });
  it('cancels a demolished depot without silently losing its loaded garbage', () => {
    const f = fixture();
    f.home.garbage!.stock = 100;
    f.garbage.tick();
    for (
      let i = 0;
      i < 200 && !f.s.garbage.missions.some((m) => m.phase === 'return');
      i++
    )
      f.step();
    f.s.buildings = f.s.buildings.filter((b) => b.id !== f.facility.id);
    f.garbage.reconcile();
    expect(f.home.garbage!.stock).toBe(100);
    expect(f.s.garbage.missions).toHaveLength(0);
    expect(f.s.garbage.lost).toBe(0);
  });
  it('requires MS1 and road access to place a landfill using the normal building command', () => {
    const { s } = garbageState();
    s.buildings = [];
    s.settings.mode = 'normal';
    s.unlocked = [0];
    s.money = 10000;
    const sim = new Simulation(s.settings, undefined, s);
    expect(sim.place('garbage_landfill', { x: 0, z: 9 }, 0).ok).toBe(false);
    s.unlocked.push(1);
    const unlocked = new Simulation(s.settings, undefined, s);
    expect(unlocked.place('garbage_landfill', { x: 0, z: 9 }, 0)).toMatchObject(
      { ok: true, cost: 6000 },
    );
    expect(unlocked.snapshot().buildings[0]!.wasteFacility!.stock).toBe(0);
  });
});
