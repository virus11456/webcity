import { describe, expect, it } from 'vitest';
import { RoadGraph } from '../../src/world/roadGraph';
import { LaneGraph, lanePointAt } from '../../src/world/laneGraph';
import { Pathfinder } from '../../src/sim/systems/pathfinding';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { updatePopulation } from '../../src/sim/systems/population';
import { createState } from '../../src/sim/state';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { initialHousing } from '../../src/world/population';
import { hourTicks, JourneyStatus } from '../../src/world/schedules';
import type { RoadTypeId } from '../../src/data/roads';
import type { RoadNode, RoadSegment } from '../../src/world/types';
import type { Route } from '../../src/world/routes';
function road(
  g: RoadGraph,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  type: RoadTypeId = 'road_small',
) {
  g.addRoad({
    start: { x: ax, z: az },
    end: { x: bx, z: bz },
    type,
    builtDay: 0,
    startHeight: 60,
    endHeight: 60,
  });
}
function setup(g: RoadGraph) {
  const world = g.snapshot(),
    lanes = new LaneGraph();
  lanes.sync(world.nodes, world.segments);
  const paths = new Pathfinder(lanes);
  paths.sync(world.nodes, world.segments);
  return { world, lanes, paths };
}
function continuous(route: Route | null) {
  expect(route).not.toBeNull();
  const legs = route!.legs;
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1]!,
      b = legs[i]!,
      p = lanePointAt(a.points, (a.startDistance ?? 0) + a.length),
      q = lanePointAt(b.points, b.startDistance ?? 0);
    expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(0.001);
  }
}
describe('directed routing and independent walking graph', () => {
  it('walks either way on a one-way street while cars cannot drive backwards', () => {
    const g = new RoadGraph();
    road(g, 0, 0, 200, 0, 'road_small_oneway');
    const { paths } = setup(g);
    const from = { x: 30, z: 8 },
      to = { x: 170, z: 8 };
    continuous(paths.find(from, to, 'drive'));
    expect(paths.find(to, from, 'drive')).toBeNull();
    continuous(paths.find(to, from, 'walk'));
  });
  it('re-enters its starting lane through a one-way loop to reach a destination behind', () => {
    const g = new RoadGraph();
    for (const [a, b, c, d] of [
      [0, 0, 200, 0],
      [200, 0, 200, 200],
      [200, 200, 0, 200],
      [0, 200, 0, 0],
    ])
      road(g, a!, b!, c!, d!, 'road_small_oneway');
    const { paths } = setup(g);
    const route = paths.find({ x: 170, z: 8 }, { x: 30, z: 8 }, 'drive');
    continuous(route);
    expect(route!.length).toBeGreaterThan(500);
  });
  it('gives residents with the same home different work routes, obeys turn bans and invalidates cached routes', () => {
    const g = new RoadGraph();
    road(g, -200, 0, 200, 0);
    road(g, 0, -200, 0, 200);
    const { paths, lanes, world } = setup(g);
    const home = { x: -150, z: 8 },
      left = { x: 8, z: -150 },
      right = { x: 8, z: 150 };
    const a = paths.find(home, left, 'drive'),
      b = paths.find(home, right, 'drive');
    continuous(a);
    continuous(b);
    expect(a!.legs.map((l) => l.id)).not.toEqual(b!.legs.map((l) => l.id));
    const count = paths.computations;
    expect(paths.find(home, left, 'drive', 29)).toBe(a);
    expect(paths.computations).toBe(count);
    paths.find(home, left, 'drive', 30);
    expect(paths.computations).toBe(count + 1);
    world.nodes.find((n) => n.segments.length === 4)!.banLeft = true;
    lanes.sync(world.nodes, world.segments);
    paths.sync(world.nodes, world.segments);
    expect(paths.find(home, left, 'drive')).toBeNull();
    continuous(paths.find(home, right, 'drive'));
    continuous(paths.find(home, left, 'walk'));
  });
  it('does not jump between disconnected roads or use highways as sidewalks', () => {
    const g = new RoadGraph();
    road(g, 0, 0, 200, 0);
    road(g, 240, 0, 400, 0);
    const a = setup(g);
    expect(a.paths.find({ x: 30, z: 8 }, { x: 370, z: 8 }, 'walk')).toBeNull();
    expect(a.paths.find({ x: 30, z: 8 }, { x: 370, z: 8 }, 'drive')).toBeNull();
    road(g, 200, 0, 240, 0, 'highway_ramp');
    const b = setup(g);
    continuous(b.paths.find({ x: 30, z: 8 }, { x: 370, z: 8 }, 'drive'));
    expect(b.paths.find({ x: 30, z: 8 }, { x: 370, z: 8 }, 'walk')).toBeNull();
    expect(
      b.paths.find({ x: 30, z: 100 }, { x: 170, z: 8 }, 'drive'),
    ).toBeNull();
  });
  it('changes only between adjacent lanes in the final third when successive turns require different lanes', () => {
    const g = new RoadGraph();
    road(g, -200, 0, 0, 0, 'road_medium');
    road(g, 0, 0, 0, -200, 'road_medium');
    road(g, 0, -200, 200, -200, 'road_medium');
    const { paths, lanes } = setup(g);
    // East -> north is a left turn (inner lane), then north -> east requires an outer right-turn lane.
    const a = [...lanes.lanes.values()].find(
      (l) => l.points[0]!.x < -150 && l.direction === 1 && l.index === 0,
    )!;
    const end = [...lanes.lanes.values()].filter(
      (l) => l.points.at(-1)!.x > 150 && l.direction === 1,
    );
    const route = paths.between(
      [{ lane: a.id, distance: 20 }],
      end.map((l) => ({ lane: l.id, distance: l.length - 20 })),
    );
    continuous(route);
    const changes = route!.legs.filter((l) => l.kind === 'laneChange');
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      const from = lanes.lanes.get(change.fromLane!)!,
        to = lanes.lanes.get(change.toLane!)!;
      expect(Math.abs(from.index - to.index)).toBe(1);
      expect(from.direction).toBe(to.direction);
    }
  });
  it('congestion changes route cost and invalidates the cache while walking ignores vehicle congestion', () => {
    const g = new RoadGraph();
    road(g, 0, 0, 200, 0);
    const { paths, world } = setup(g),
      a = { x: 20, z: 8 },
      b = { x: 180, z: 8 };
    const clear = paths.find(a, b, 'drive')!,
      walk = paths.find(a, b, 'walk')!;
    paths.setCongestion(new Map([[world.segments[0]!.id, 0.2]]));
    const jammed = paths.find(a, b, 'drive')!;
    expect(jammed.costSeconds).toBeCloseTo(clear.costSeconds * 5);
    expect(paths.find(a, b, 'walk')!.costSeconds).toBeCloseTo(walk.costSeconds);
  });
});
it('worker route jobs are bounded and broken-road journeys remain at the origin', () => {
  const s = createState({
      seed: 72,
      mapId: 'valley',
      mode: 'normal',
      cityName: 'Paths',
    }),
    base = districtFixture(1)[0]!;
  const home = {
    ...structuredClone(base),
    id: 1,
    defId: 'RH',
    state: 'active' as const,
    level: 5,
    lotW: 4,
    lotD: 4,
    pos: { x: 30, z: 8 },
    residents: 400,
    households: 80,
  };
  home.housing = initialHousing(home, 90);
  s.buildings = [
    home,
    {
      ...structuredClone(base),
      id: 2,
      defId: 'I',
      state: 'active',
      lotW: 8,
      lotD: 8,
      pos: { x: 800, z: 8 },
      residents: 0,
      households: 0,
    },
  ];
  updatePopulation(s);
  s.citizens.shiftId.fill(0);
  const schedules = new ScheduleSystem(s),
    lanes = new LaneGraph(),
    planner = new RoutePlanner(s, lanes, schedules);
  s.clock.ticks = hourTicks(9);
  schedules.tick();
  expect(planner.tick()).toBeLessThanOrEqual(24);
  expect(
    [...s.citizens.tripStatus.slice(0, s.citizens.count)].filter(
      (v) => v === JourneyStatus.blocked,
    ),
  ).toHaveLength(24);
  expect(
    [...s.citizens.locationId.slice(0, s.citizens.count)].every(
      (id) => id === 1,
    ),
  ).toBe(true);
  const g = new RoadGraph();
  road(g, 0, 0, 900, 0);
  Object.assign(s, g.snapshot());
  lanes.sync(s.nodes, s.segments);
  s.clock.ticks += 20;
  for (let i = 0; i < 10; i++) planner.tick();
  const ready = planner.takeReady();
  expect(ready.length).toBeGreaterThan(0);
  for (const job of ready) {
    expect(job.journey.originId).toBe(1);
    expect(job.journey.destinationId).toBe(2);
    continuous(job.route);
  }
});
function grid(width: number, height: number) {
  const nodes: RoadNode[] = [],
    segments: RoadSegment[] = [];
  let id = 1;
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++)
      nodes.push({
        id: id++,
        pos: { x: x * 64, z: z * 64 },
        height: 60,
        segments: [],
        control: 'none',
      });
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++)
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
      ]) {
        if (x + dx! >= width || z + dz! >= height) continue;
        const a = nodes[z * width + x]!,
          b = nodes[(z + dz!) * width + x + dx!]!,
          seg: RoadSegment = {
            id: id++,
            start: a.id,
            end: b.id,
            type: 'road_small',
            c1: {
              x: a.pos.x + (b.pos.x - a.pos.x) / 3,
              z: a.pos.z + (b.pos.z - a.pos.z) / 3,
            },
            c2: {
              x: a.pos.x + (2 * (b.pos.x - a.pos.x)) / 3,
              z: a.pos.z + (2 * (b.pos.z - a.pos.z)) / 3,
            },
            length: 64,
            elevated: false,
            builtDay: 0,
            zoneBlockIds: [],
          };
        segments.push(seg);
        a.segments.push(seg.id);
        b.segments.push(seg.id);
      }
  return { nodes, segments };
}
it('uncached A* on a 1000-node network stays within the 2 ms query budget', () => {
  const world = grid(40, 25),
    lanes = new LaneGraph();
  lanes.sync(world.nodes, world.segments);
  const paths = new Pathfinder(lanes);
  paths.sync(world.nodes, world.segments);
  // Warm the JIT and frontage index; route results are never cached by between().
  for (let i = 0; i < 100; i++)
    paths.between(
      paths.access({ x: 32, z: (i % 20) * 64 + 8 }, 'drive'),
      paths.access({ x: 39 * 64 - 32, z: ((i + 7) % 20) * 64 + 8 }, 'drive'),
    );
  const samples: number[] = [];
  for (let i = 0; i < 40; i++) {
    const from = { x: 32, z: (i % 20) * 64 + 8 },
      to = { x: 39 * 64 - 32, z: ((i + 5) % 20) * 64 + 8 };
    const start = performance.now();
    const route = paths.between(
      paths.access(from, 'drive'),
      paths.access(to, 'drive'),
    );
    samples.push(performance.now() - start);
    expect(route).not.toBeNull();
  }
  samples.sort((a, b) => a - b);
  console.log('1000-node uncached A* p95 ms', samples[38]);
  expect(samples[38]).toBeLessThan(2);
});

it('removing a road invalidates an already cached route and never snaps to another parallel road', () => {
  const g = new RoadGraph();
  road(g, 0, 0, 200, 0);
  road(g, 200, 0, 400, 0);
  road(g, 0, 40, 400, 40);
  const { paths, lanes } = setup(g),
    a = { x: 20, z: 8 },
    b = { x: 380, z: 8 };
  continuous(paths.find(a, b, 'drive'));
  const middle = g
    .snapshot()
    .segments.find(
      (s) =>
        s.length === 200 &&
        g.snapshot().nodes.find((n) => n.id === s.start)!.pos.x === 200,
    )!;
  g.removeSegment(middle.id);
  const world = g.snapshot();
  lanes.sync(world.nodes, world.segments);
  paths.sync(world.nodes, world.segments);
  expect(paths.find(a, b, 'drive')).toBeNull();
  expect(paths.find(a, b, 'walk')).toBeNull();
});
it('reroutes around congestion instead of merely relabeling an unchanged shortest path', () => {
  const g = new RoadGraph();
  road(g, 0, 0, 400, 0);
  road(g, 100, 0, 100, 200);
  road(g, 100, 200, 300, 200);
  road(g, 300, 200, 300, 0);
  const { paths, world } = setup(g),
    from = { x: 30, z: 8 },
    to = { x: 370, z: 8 };
  const middle = world.segments.find((s) => {
    const a = world.nodes.find((n) => n.id === s.start)!,
      b = world.nodes.find((n) => n.id === s.end)!;
    return (
      a.pos.z === 0 &&
      b.pos.z === 0 &&
      Math.min(a.pos.x, b.pos.x) === 100 &&
      Math.max(a.pos.x, b.pos.x) === 300
    );
  })!;
  const clear = paths.find(from, to, 'drive')!;
  expect(clear.legs.some((l) => l.segment === middle.id)).toBe(true);
  paths.setCongestion(new Map([[middle.id, 0.1]]));
  const detour = paths.find(from, to, 'drive');
  continuous(detour);
  expect(
    detour!.legs.some((l) => l.kind === 'lane' && l.segment === middle.id),
  ).toBe(false);
  expect(detour!.length).toBeGreaterThan(clear.length);
});
