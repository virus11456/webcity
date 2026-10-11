import { describe, expect, it } from 'vitest';
import { closestPointOnSegment } from '../../src/core/math';
import { ROADS } from '../../src/data/roads';
import { BULLDOZE } from '../../src/data/bulldoze';
import { RoadGraph } from '../../src/world/roadGraph';
import { ServiceNetwork, type ServiceAccess } from '../../src/world/services';
import type { Vec2 } from '../../src/world/types';

function exhaustive(network: ServiceNetwork, pos: Vec2, setback: number) {
  let best = Infinity,
    result: ServiceAccess | undefined;
  for (const [id, link] of network.links) {
    if (link.segment.elevated || ROADS[link.segment.type].zoning === 'none')
      continue;
    const limit =
      ROADS[link.segment.type].widthM / 2 +
      BULLDOZE.frontageToleranceM +
      setback;
    for (let i = 1; i < link.points.length; i++) {
      const a = link.points[i - 1]!,
        b = link.points[i]!,
        p = closestPointOnSegment(pos, a, b);
      if (p.distance <= limit && p.distance < best) {
        best = p.distance;
        result = {
          road: id,
          distance: a.distance + p.t * (b.distance - a.distance),
        };
      }
    }
  }
  return result;
}
function fixture(length: number) {
  const g = new RoadGraph();
  g.addRoad({
    start: { x: -length / 2, z: 0 },
    end: { x: length / 2, z: 0 },
    type: 'road_small',
    startHeight: 60,
    endHeight: 60,
    builtDay: 0,
  });
  return g.snapshot();
}
function compare(network: ServiceNetwork) {
  for (const link of network.links.values())
    for (let i = 0; i < link.points.length; i++) {
      const p = link.points[i]!;
      for (const setback of [0, 8, 80]) {
        const limit =
          ROADS[link.segment.type].widthM / 2 +
          BULLDOZE.frontageToleranceM +
          setback;
        for (const offset of [-1e-8, 0, 1e-8]) {
          const pos = { x: p.x, z: p.z + limit + offset };
          expect(network.access(pos, setback)).toEqual(
            exhaustive(network, pos, setback),
          );
        }
      }
    }
}
describe('ordered service access blocks', () => {
  it.each([32, 128, 136, 2048])(
    'matches exhaustive access on every sample boundary of a %i m road',
    (length) => {
      const { nodes, segments } = fixture(length);
      segments.push({ ...segments[0]!, id: 999 }); // Equal distance preserves the original road order.
      compare(new ServiceNetwork(nodes, segments));
    },
  );
  it('keeps conservative bounds on a folded curve and respects changed road width', () => {
    const { nodes, segments } = fixture(160);
    segments[0]!.c1 = { x: 300, z: 240 };
    segments[0]!.c2 = { x: -300, z: -240 };
    const network = new ServiceNetwork(nodes, segments);
    compare(network);
    segments[0]!.type = 'road_large';
    compare(network);
  });
  it('rebuilds bounds with geometry after road edits instead of retaining stale projections', () => {
    const { nodes, segments } = fixture(2048);
    const original = new ServiceNetwork(nodes, segments);
    const pos = { x: 0, z: 10 };
    expect(original.access(pos)).toBeDefined();
    for (const node of nodes) node.pos.z += 300;
    segments[0]!.c1.z += 300;
    segments[0]!.c2.z += 300;
    const rebuilt = new ServiceNetwork(nodes, segments);
    expect(rebuilt.access(pos)).toBeUndefined();
    expect(rebuilt.access({ x: 0, z: 310 })).toEqual(
      exhaustive(rebuilt, { x: 0, z: 310 }, 0),
    );
    expect(
      new ServiceNetwork(nodes, []).access({ x: 0, z: 310 }),
    ).toBeUndefined();
  });
});
