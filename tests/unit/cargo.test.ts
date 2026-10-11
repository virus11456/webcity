import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { CargoSystem } from '../../src/sim/systems/cargo';
import { updateProblems } from '../../src/sim/systems/problems';
import { updateDemand } from '../../src/sim/systems/demand';
import { hasBuildingProblem } from '../../src/world/buildingProblems';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { deserialize, serialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import { CARGO } from '../../src/data/cargo';
import type { RoadTypeId } from '../../src/data/roads';
function fixture(outside = false) {
  const s = createState({
      seed: 42,
      mapId: 'valley',
      mode: 'sandbox',
      cityName: 'Goods',
    }),
    roads = new RoadGraph();
  const road = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    type: RoadTypeId = 'road_small',
  ) =>
    roads.addRoad({
      start: { x: ax, z: az },
      end: { x: bx, z: bz },
      type,
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
  road(-1000, 0, 0, 0);
  if (outside) {
    road(0, 0, 2400, 0, 'highway');
    road(2400, 40, 0, 40, 'highway');
    road(0, 40, 0, 0);
  }
  Object.assign(s, roads.snapshot());
  s.nextId = 10003;
  s.buildings = ['I', 'CL'].map((defId, i) => ({
    ...structuredClone(districtFixture(1)[0]!),
    id: 10001 + i,
    kind: 'zoned' as const,
    defId,
    state: 'active' as const,
    level: 1,
    pos: { x: i ? -200 : -600, z: 8 },
    lotW: 4,
    lotD: 4,
    flags: 7,
    jobs: 64,
    workers: 32,
    residents: 0,
    households: 0,
  }));
  const lanes = new LaneGraph();
  lanes.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, lanes, schedules),
    traffic = new TrafficSystem(s, lanes, planner, schedules),
    cargo = new CargoSystem(s, lanes, planner, traffic);
  const factory = s.buildings[0]!,
    shop = s.buildings[1]!;
  factory.cargo!.stock = 120;
  shop.cargo!.stock = 0;
  shop.cargo!.shortage = true;
  const network = () => {
    Object.assign(s, roads.snapshot());
    s.nextId = 10003;
    lanes.sync(s.nodes, s.segments);
    traffic.networkChanged();
    cargo.networkChanged();
  };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      s.clock.ticks++;
      s.clock.day = Math.floor(s.clock.ticks / 10);
      s.clock.tickInDay = s.clock.ticks % 10;
      traffic.step(0.24);
      cargo.tick();
    }
  };
  return {
    s,
    roads,
    road,
    lanes,
    planner,
    traffic,
    cargo,
    factory,
    shop,
    network,
    step,
  };
}
describe('actual goods shipments', () => {
  it('exports specialized raw material only after a real truck reaches the boundary, never supplies shops', () => {
    const f = fixture(true);
    f.factory.industry = 'industry_forestry';
    f.cargo.tick();
    expect(
      f.s.cargo.shipments.find((j) => j.from === f.factory.id),
    ).toMatchObject({ kind: 'export', to: 0, commodity: 'industry_forestry' });
    expect(f.s.cargo.exported).toBe(0);
    expect(f.shop.cargo!.stock).toBe(0);
    f.step(500);
    expect(f.s.cargo.exported).toBe(120);
    expect(f.s.cargo.delivered).toBe(0);
  });
  it('produces raw material in proportion to local resources once per day, and stops without workers or while disabled', () => {
    const f = fixture();
    f.factory.industry = 'industry_oil';
    f.factory.cargo!.stock = 0;
    f.s.terrain.resources.oil.fill(128);
    f.cargo.daily();
    f.cargo.daily();
    expect(f.factory.cargo!.stock).toBeCloseTo(
      (32 * CARGO.productionPerWorkerDay * 128) / 255,
    );
    const initial = f.factory.cargo!.stock;
    f.s.clock.day++;
    f.s.terrain.resources.oil.fill(0);
    f.cargo.daily();
    expect(f.factory.cargo!.stock).toBe(initial);
    f.s.clock.day++;
    f.s.terrain.resources.oil.fill(255);
    f.factory.enabled = false;
    f.cargo.daily();
    expect(f.factory.cargo!.stock).toBe(initial);
    f.s.clock.day++;
    f.factory.enabled = true;
    f.factory.workers = 0;
    f.cargo.daily();
    expect(f.factory.cargo!.stock).toBe(initial);
  });
  it('retains specialized stock and signals a blocked export when there is no outside highway', () => {
    const f = fixture();
    f.factory.industry = 'industry_ore';
    f.cargo.tick();
    expect(f.factory.cargo!.exportBlocked).toBe(true);
    expect(f.factory.cargo!.stock).toBe(120);
    expect(f.s.cargo.shipments).toHaveLength(0);
  });

  it('loads industrial stock and supplies commerce only after a truck arrives', () => {
    const f = fixture();
    f.cargo.tick();
    expect(f.s.cargo.shipments[0]).toMatchObject({
      from: 10001,
      to: 10002,
      units: 120,
      kind: 'local',
    });
    expect(f.factory.cargo!.stock).toBe(0);
    expect(f.shop.cargo!.stock).toBe(0);
    expect(f.traffic.count).toBe(1);
    expect(f.traffic.frame().data[2]).toBe(1);
    expect(f.traffic.frame().data[8]).toBe(8);
    f.step();
    expect(f.shop.cargo!.stock).toBe(0);
    f.step(150);
    expect(f.shop.cargo!.stock).toBe(120);
    expect(f.s.cargo.delivered).toBe(120);
    expect(f.shop.cargo!.shortage).toBe(false);
  });
  it('exports surplus and imports store shortages through directional boundary highways', () => {
    const out = fixture(true);
    out.s.buildings.pop();
    out.cargo.tick();
    expect(out.s.cargo.shipments[0]?.kind).toBe('export');
    out.step(500);
    expect(out.s.cargo.exported).toBe(120);
    const input = fixture(true);
    input.s.buildings.shift();
    input.cargo.tick();
    expect(input.s.cargo.shipments[0]?.kind).toBe('import');
    expect(input.shop.cargo!.stock).toBe(0);
    input.step(500);
    expect(input.s.cargo.imported).toBeGreaterThan(0);
    expect(input.shop.cargo!.stock).toBeGreaterThan(0);
  });
  it('shows cannot export and reduces industrial demand when the highway is cut', () => {
    const f = fixture(true);
    f.s.buildings.pop();
    f.factory.cargo!.stock = 240;
    f.cargo.tick();
    f.step(10);
    const highway = f.s.segments.find(
      (r) =>
        r.type === 'highway' &&
        f.s.nodes.find((n) => n.id === r.end)!.pos.x === 2400,
    )!;
    f.roads.removeSegment(highway.id);
    f.network();
    expect(f.factory.cargo!.exportBlocked).toBe(true);
    expect(hasBuildingProblem(f.factory, 'noGoods')).toBe(true);
    expect(f.s.cargo.exported).toBe(0);
    updateProblems(f.s);
    f.s.clock.ticks += 10;
    updateProblems(f.s);
    expect(f.factory.problemTimers.noGoods).toBeGreaterThan(0);
    f.s.buildings.push({
      ...f.factory,
      id: 10010,
      defId: 'RH',
      residents: 1000,
      jobs: 0,
      workers: 0,
      cargo: undefined,
    });
    updateDemand(f.s);
    const blocked = f.s.stats.demand.I;
    f.factory.cargo!.exportBlocked = false;
    f.factory.problemTimers.noGoods = 0;
    updateDemand(f.s);
    expect(f.s.stats.demand.I - blocked).toBeCloseTo(50);
  });
  it('retains the loaded goods and exact stranded position after a road cut, then resumes after repair', () => {
    const f = fixture(true);
    f.s.buildings.pop();
    f.cargo.tick();
    f.step(10);
    const job = f.s.cargo.shipments[0]!,
      before = f.traffic.inspect(1)!;
    const highway = f.s.segments.find(
      (r) =>
        r.type === 'highway' &&
        f.s.nodes.find((n) => n.id === r.end)!.pos.x === 2400,
    )!;
    f.roads.removeSegment(highway.id);
    f.network();
    f.step(30);
    expect(f.traffic.strandedMission(job.id)).toMatchObject({
      x: before.x,
      z: before.z,
    });
    expect(job.units).toBe(120);
    expect(f.s.cargo.exported).toBe(0);
    expect(f.factory.cargo!.stock).toBe(0);
    f.road(0, 0, 2400, 0, 'highway');
    f.network();
    f.step(500);
    expect(f.s.cargo.exported).toBe(120);
    expect(f.s.cargo.lost).toBe(0);
  });
  it('preserves moving trucks and stock through serialization and rejects orphan missions', async () => {
    const f = fixture();
    f.cargo.tick();
    f.step(10);
    const snap = { ...f.s, traffic: f.traffic.snapshot() };
    const loaded = await deserialize(await serialize(snap));
    expect(loaded.cargo).toEqual(f.s.cargo);
    expect(loaded.traffic.vehicles[0]!.journey.citizenId).toBeLessThan(0);
    const old = structuredClone(snap);
    old.traffic.vehicles = [];
    old.traffic.routes = [];
    Reflect.deleteProperty(old, 'cargo');
    Reflect.deleteProperty(old.traffic, 'nextMissionId');
    expect(migrateSave(old, 1).cargo.shipments).toHaveLength(0);
    loaded.cargo.shipments = [];
    expect(() => migrateSave(loaded, 1)).toThrow();
  });
  it('updates production and consumption once per day and cleans demolished destinations while paused', () => {
    const f = fixture();
    f.factory.cargo!.stock = 0;
    f.shop.cargo!.stock = 20;
    f.cargo.daily();
    f.cargo.daily();
    expect(f.factory.cargo!.stock).toBe(32 * CARGO.productionPerWorkerDay);
    expect(f.shop.cargo!.stock).toBe(20 - 64 * CARGO.consumptionPerJobDay);
    f.s.clock.day++;
    f.cargo.daily();
    expect(f.shop.cargo!.shortage).toBe(true);
    f.cargo.tick();
    expect(f.traffic.count).toBe(1);
    const units = f.s.cargo.shipments[0]!.units;
    f.s.buildings.pop();
    f.cargo.reconcile();
    expect(f.traffic.count).toBe(0);
    expect(f.s.cargo.shipments).toHaveLength(0);
    expect(f.s.cargo.lost).toBe(units);
  });
});
