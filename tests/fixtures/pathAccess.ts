import { RoadGraph } from '../../src/world/roadGraph';
import { LaneGraph } from '../../src/world/laneGraph';
import { Pathfinder } from '../../src/sim/systems/pathfinding';

/** Disconnected roads of mixed widths, directions and curvature. */
export function pathAccessFixture(length: number) {
  const roads = new RoadGraph();
  for (let row = 0; row < 16; row++)
    roads.addRoad({
      start: { x: -length / 2, z: row * 96 },
      end: { x: length / 2, z: row * 96 },
      type:
        row % 3 === 0
          ? 'road_small_oneway'
          : row % 3 === 1
            ? 'road_large'
            : 'gravel',
      builtDay: 0,
      startHeight: 60,
      endHeight: 64,
    });
  const world = roads.snapshot();
  for (const [i, segment] of world.segments.entries()) {
    if (i % 2) {
      segment.c1.z += 24;
      segment.c2.z -= 24;
    }
  }
  const lanes = new LaneGraph();
  lanes.sync(world.nodes, world.segments);
  const createPaths = () => {
    const paths = new Pathfinder(lanes);
    paths.sync(world.nodes, world.segments);
    return paths;
  };
  const queries = Array.from({ length: 1024 }, (_, i) => ({
    point: {
      x: ((i % 64) / 63 - 0.5) * length,
      z: Math.floor(i / 64) * 96 + ((i % 5) - 2) * 8,
    },
    setback: (i % 3) * 8,
  }));
  return { world, lanes, createPaths, queries };
}
