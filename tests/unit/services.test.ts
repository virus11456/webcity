import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import { ServiceNetwork, previewService } from '../../src/world/services';
import { ServiceSystem } from '../../src/sim/systems/services';
import { Simulation } from '../../src/sim/simulation';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { serialize, deserialize } from '../../src/save/serializer';
import { weeklyAccounts } from '../../src/sim/systems/economy';
import type { Building } from '../../src/world/types';
function fixture() {
  const s = createState({
      seed: 42,
      mapId: 'valley',
      mode: 'sandbox',
      cityName: 'Services',
    }),
    g = new RoadGraph();
  s.terrain.heights.fill(60);
  const road = (ax: number, az: number, bx: number, bz: number) =>
    g.addRoad({
      start: { x: ax, z: az },
      end: { x: bx, z: bz },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  road(-300, 0, 300, 0);
  road(300, 0, 300, 300);
  road(300, 300, -300, 300);
  const b = (
    id: number,
    defId: string,
    x: number,
    z: number,
    kind: Building['kind'] = 'zoned',
  ): Building => ({
    ...structuredClone(districtFixture(1)[0]!),
    id,
    defId,
    kind,
    pos: { x, z },
    rotation: 0,
    state: 'active',
    lotW: 4,
    lotD: 4,
    flags: 7,
    residents: 0,
    jobs: 0,
    workers: 0,
    households: 0,
  });
  s.buildings = [
    b(10001, 'police_station', -200, 8, 'service'),
    b(10002, 'RL', 0, 8),
    b(10003, 'RL', -200, 308),
  ];
  Object.assign(s, g.snapshot());
  s.nextId = 10004;
  const system = new ServiceSystem(s);
  return { s, g, system, b, road };
}
describe('road-network public services', () => {
  it('uses road distance, clips long source edges, and never jumps between nearby disconnected roads', () => {
    const { s } = fixture(),
      network = new ServiceNetwork(s.nodes, s.segments),
      origin = network.access(s.buildings[0]!.pos)!;
    const reach = network.reach(origin, 500);
    expect(
      network.coverage(reach, network.access(s.buildings[1]!.pos)),
    ).toBeCloseTo(0.6);
    expect(network.coverage(reach, network.access(s.buildings[2]!.pos))).toBe(
      0,
    ); // straight distance 300, road distance 1300
    const line = network.pieces(network.reach(origin, 50)).flat();
    expect(Math.min(...line.map((p) => p.x))).toBeCloseTo(-250);
    expect(Math.max(...line.map((p) => p.x))).toBeCloseTo(-150);
    const disconnected = s.segments.filter(
      (r) => r.start !== s.segments[1]!.start || r.end !== s.segments[1]!.end,
    );
    const other = new ServiceNetwork(s.nodes, disconnected);
    expect(
      other.coverage(
        other.reach(other.access(s.buildings[0]!.pos)!, 2000),
        other.access(s.buildings[2]!.pos),
      ),
    ).toBe(0);
  });
  it('takes max same-type coverage, scales overloaded capacity and both radius/capacity with budget, and removes disabled coverage', () => {
    const { s, system, b } = fixture();
    s.buildings[1]!.residents = 2400;
    system.update();
    expect(s.buildings[1]!.coverage!.police).toBeCloseTo(0.3);
    expect(s.buildings[0]!.serviceStatus!.capacity).toBe(1200);
    s.budgets.police = 0.5;
    system.update();
    expect(s.buildings[1]!.coverage!.police).toBeCloseTo(0.05);
    s.budgets.police = 1;
    s.buildings.push(b(10004, 'police_station', -100, 8, 'service'));
    system.update();
    expect(s.buildings[1]!.coverage!.police).toBeCloseTo(0.4);
    s.buildings[3]!.enabled = false;
    system.update();
    expect(s.buildings[1]!.coverage!.police).toBeCloseTo(0.3);
    s.buildings[0]!.enabled = false;
    system.update();
    expect(s.buildings[1]!.coverage!.police).toBeUndefined();
    expect(s.fields.coverage.police.some((v) => v > 0)).toBe(false);
  });
  it('drops exact building coverage and raster after a disconnected road is demolished', () => {
    const { s, system } = fixture();
    s.budgets.police = 1.5;
    system.update();
    expect(s.buildings[1]!.coverage!.police).toBeGreaterThan(0);
    s.segments = [];
    system.networkChanged();
    system.update();
    expect(s.buildings[0]!.serviceStatus!.connected).toBe(false);
    expect(s.buildings[1]!.coverage).toEqual({});
    expect(s.fields.coverage.police.every((v) => v === 0)).toBe(true);
  });
  it('uses shared placement checks and rejects facilities without physical road access', () => {
    const { s } = fixture(),
      w = {
        ...s,
        heights: s.terrain.heights,
        mode: s.settings.mode,
        networks: s.networks.power,
      };
    expect(previewService(w, 'clinic', { x: 100, z: 8 }, 0).valid).toBe(true);
    expect(previewService(w, 'clinic', { x: 100, z: 80 }, 0).reason).toBe(
      'err.serviceRoad',
    );
    expect(previewService(w, 'clinic', { x: 100, z: 0 }, 0).reason).toBe(
      'err.roadOverlap',
    );
    expect(
      previewService(
        { ...w, mode: 'normal', unlocked: [0] },
        'clinic',
        { x: 100, z: 8 },
        0,
      ).reason,
    ).toBe('err.powerLocked');
  });
  it('saves enabled state, validates toggles, stops maintenance and refreshes coverage while paused', async () => {
    const { s } = fixture();
    s.clock.speed = 0;
    const sim = new Simulation(s.settings, () => {}, s);
    expect(sim.inspect('building', 10002)?.kind).toBe('building');
    expect(
      weeklyAccounts({ ...sim.snapshot(), terrain: s.terrain }).upkeep.police,
    ).toBe(240);
    expect(sim.setBuildingEnabled(10002, false).ok).toBe(false);
    expect(sim.setBuildingEnabled(10001, false).ok).toBe(true);
    const snapshot = sim.snapshot();
    expect(snapshot.buildings[0]!.enabled).toBe(false);
    expect(snapshot.buildings[1]!.coverage?.police ?? 0).toBe(0);
    expect(
      weeklyAccounts({ ...snapshot, terrain: s.terrain }).upkeep.police,
    ).toBe(0);
    const restored = await deserialize(await serialize(snapshot));
    const next = new Simulation(s.settings, () => {}, restored);
    expect(next.snapshot().buildings[0]!.enabled).toBe(false);
    expect(next.setBuildingEnabled(10001, true).ok).toBe(true);
    expect(next.snapshot().buildings[1]!.coverage!.police).toBeGreaterThan(0);
  });
});
