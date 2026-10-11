import { describe, expect, it, vi } from 'vitest';
import * as math from '../../src/core/math';
import { closestPointOnSegment } from '../../src/core/math';
import { CELL_SIZE, MAP_SIZE } from '../../src/data/config';
import { ROADS } from '../../src/data/roads';
import { SERVICES } from '../../src/data/services';
import { ServiceNetwork, type ServiceReach } from '../../src/world/services';
import { RoadGraph } from '../../src/world/roadGraph';

// Frozen pre-cache algorithm: compare every Float32 cell, including overlapping projections.
function reference(
  network: ServiceNetwork,
  reach: ServiceReach,
  field: Float32Array,
  size: number,
  efficiency: number,
): void {
  const cell = MAP_SIZE / size;
  for (const [id, link] of network.links) {
    if (link.segment.elevated || ROADS[link.segment.type].zoning === 'none')
      continue;
    if (
      id !== reach.origin.road &&
      Math.min(
        reach.distances.get(link.segment.start) ?? Infinity,
        reach.distances.get(link.segment.end) ?? Infinity,
      ) >= reach.radius
    )
      continue;
    const width =
      ROADS[link.segment.type].widthM / 2 + CELL_SIZE * SERVICES.frontageCells;
    for (let i = 1; i < link.points.length; i++) {
      const a = link.points[i - 1]!,
        b = link.points[i]!;
      const minX = Math.max(
          0,
          Math.floor((Math.min(a.x, b.x) - width + MAP_SIZE / 2) / cell),
        ),
        maxX = Math.min(
          size - 1,
          Math.floor((Math.max(a.x, b.x) + width + MAP_SIZE / 2) / cell),
        );
      const minZ = Math.max(
          0,
          Math.floor((Math.min(a.z, b.z) - width + MAP_SIZE / 2) / cell),
        ),
        maxZ = Math.min(
          size - 1,
          Math.floor((Math.max(a.z, b.z) + width + MAP_SIZE / 2) / cell),
        );
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++) {
          const p = closestPointOnSegment(
            {
              x: (x + 0.5) * cell - MAP_SIZE / 2,
              z: (z + 0.5) * cell - MAP_SIZE / 2,
            },
            a,
            b,
          );
          if (p.distance > width) continue;
          const value =
            network.coverage(reach, {
              road: id,
              distance: a.distance + p.t * (b.distance - a.distance),
            }) * efficiency;
          const index = z * size + x;
          field[index] = Math.max(field[index]!, value);
        }
    }
  }
}
function fixture(budget?: number) {
  const graph = new RoadGraph();
  for (const [ax, az, bx, bz] of [
    [-300, 0, 300, 0],
    [300, 0, 300, 300],
    [300, 300, -300, 300],
    [-300, 300, -300, 0],
    [-400, -100, 400, -100],
    [-300, 600, 300, 600],
    [-300, 800, 300, 800],
  ])
    graph.addRoad({
      start: { x: ax!, z: az! },
      end: { x: bx!, z: bz! },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  const { nodes, segments } = graph.snapshot();
  segments[0]!.c1 = { x: -150, z: -150 };
  segments[0]!.c2 = { x: 180, z: 150 };
  segments[5]!.elevated = true;
  segments[6]!.type = 'highway';
  return {
    nodes,
    segments,
    network: new ServiceNetwork(nodes, segments, budget),
  };
}
function compare(network: ServiceNetwork, size: number) {
  const actual = new Float32Array(size * size).fill(0.0123),
    expected = actual.slice();
  for (const [road, fraction, radius, efficiency] of [
    [0, 0.43, 1300, 0.7],
    [2, 0.1, 75, 1.5],
    [4, 0.7, 200, 1],
    [0, 0.8, 430, 0],
    [1, 0.3, 800, 0.2],
  ]) {
    const link = [...network.links.values()][road!]!;
    const reach = network.reach(
      { road: link.segment.id, distance: link.length * fraction! },
      radius!,
    );
    reference(network, reach, expected, size, efficiency!);
    network.raster(reach, actual, size, efficiency!);
    expect(actual).toEqual(expected);
  }
  return actual;
}
describe('bounded service raster geometry cache', () => {
  it('matches the old raster exactly for curves, overlaps, disconnected roads and live provider values', () => {
    const { network } = fixture();
    compare(network, 300);
    expect(network.cachedRasterBytes).toBeGreaterThan(0);
    compare(network, 300);
  });
  it('reuses projections while changing radius, origin and efficiency', () => {
    const { network, segments } = fixture();
    compare(network, 300);
    const reach = network.reach({ road: segments[0]!.id, distance: 113 }, 450);
    const expected = new Float32Array(90000);
    reference(network, reach, expected, 300, 0.43);
    const spy = vi.spyOn(math, 'closestPointOnSegment');
    try {
      const actual = new Float32Array(90000);
      network.raster(reach, actual, 300, 0.43);
      expect(spy).not.toHaveBeenCalled();
      expect(actual).toEqual(expected);
    } finally {
      spy.mockRestore();
    }
  });
  it.each([0, 12, 4096])(
    'falls back exactly without exceeding a %i-byte retained payload',
    (budget) => {
      const { network } = fixture(budget);
      compare(network, 300);
      compare(network, 300);
      expect(network.cachedRasterBytes).toBeLessThanOrEqual(budget);
    },
  );
  it('replaces geometry on grid resolution and road width changes', () => {
    const { network, nodes, segments } = fixture();
    compare(network, 300);
    compare(network, 97);
    const fresh = new ServiceNetwork(nodes, segments);
    compare(fresh, 97);
    expect(network.cachedRasterBytes).toBe(fresh.cachedRasterBytes);
    segments[0]!.type = 'road_large';
    compare(network, 97);
    compare(network, 300);
  });
  it('does not carry projections across rebuilt topology', () => {
    const { network, nodes, segments } = fixture();
    compare(network, 300);
    const rebuilt = new ServiceNetwork(
      nodes,
      segments.filter((_, i) => i !== 1),
    );
    expect(rebuilt.cachedRasterBytes).toBe(0);
    const reach = rebuilt.reach({ road: segments[0]!.id, distance: 40 }, 600);
    const expected = new Float32Array(90000),
      actual = expected.slice();
    reference(rebuilt, reach, expected, 300, 1);
    rebuilt.raster(reach, actual, 300, 1);
    expect(actual).toEqual(expected);
  });
});
