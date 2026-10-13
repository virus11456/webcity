import { describe, expect, it } from 'vitest';
import { closestPointOnSegment } from '../../src/core/math';
import { PATHFINDING as C } from '../../src/data/pathfinding';
import { ROADS } from '../../src/data/roads';
import { sampleRoad } from '../../src/world/roadProfile';
import type { Vec2 } from '../../src/world/types';
import { pathAccessFixture } from '../fixtures/pathAccess';

function reference(
  f: ReturnType<typeof pathAccessFixture>,
  point: Vec2,
  setback: number,
) {
  const nodes = new Map(f.world.nodes.map((n) => [n.id, n]));
  let best = Infinity,
    selected = 0;
  for (const s of f.world.segments) {
    if (s.elevated || ROADS[s.type].zoning === 'none') continue;
    const points = sampleRoad(s, nodes.get(s.start)!, nodes.get(s.end)!);
    let d = Infinity;
    for (let i = 1; i < points.length; i++)
      d = Math.min(
        d,
        closestPointOnSegment(point, points[i - 1]!, points[i]!).distance,
      );
    if (
      d <= ROADS[s.type].widthM / 2 + C.frontageToleranceM + setback &&
      (d < best || (d === best && s.id < selected))
    ) {
      best = d;
      selected = s.id;
    }
  }
  const drive = [];
  for (const l of f.lanes.lanes.values()) {
    if (l.segment !== selected) continue;
    let best = Infinity,
      distance = 0;
    for (let i = 1; i < l.points.length; i++) {
      const a = l.points[i - 1]!,
        b = l.points[i]!,
        p = closestPointOnSegment(point, a, b);
      if (p.distance < best) {
        best = p.distance;
        distance = a.distance + (b.distance - a.distance) * p.t;
      }
    }
    drive.push({ lane: l.id, distance });
  }
  return {
    drive,
    walk: selected ? [`walk:${selected}:1`, `walk:${selected}:-1`] : [],
  };
}
function check(f: ReturnType<typeof pathAccessFixture>, queries = f.queries) {
  const paths = f.createPaths();
  for (const q of queries) {
    const expected = reference(f, q.point, q.setback);
    expect(paths.access(q.point, 'drive', q.setback)).toEqual(expected.drive);
    expect(paths.access(q.point, 'walk', q.setback).map((a) => a.lane)).toEqual(
      expected.walk,
    );
  }
  return paths;
}
describe('frontage projection pruning', () => {
  it.each([80, 2048])(
    'matches exhaustive selection and drive projections for %dm straight/curved roads',
    (length) => {
      check(pathAccessFixture(length));
    },
  );
  it('keeps exact frontage boundaries, endpoints and outside points for all setbacks', () => {
    const f = pathAccessFixture(2048),
      width = ROADS[f.world.segments[0]!.type].widthM / 2;
    check(
      f,
      [0, 8, 16].flatMap((setback) =>
        [-1024, -512, 0, 512, 1024].flatMap((x) =>
          [-1e-9, 0, 1e-9].map((delta) => ({
            point: { x, z: -(width + C.frontageToleranceM + setback + delta) },
            setback,
          })),
        ),
      ),
    );
  });
  it('preserves lower road ID ties regardless of iteration order and invalidates after geometry changes', () => {
    const f = pathAccessFixture(80),
      first = f.world.segments[0]!,
      second = f.world.segments[1]!;
    const byId = new Map(f.world.nodes.map((n) => [n.id, n]));
    byId.get(second.start)!.pos.z = 16;
    byId.get(second.end)!.pos.z = 16;
    second.c1.z = 16;
    second.c2.z = 16;
    f.world.segments.reverse();
    f.lanes.sync(f.world.nodes, f.world.segments);
    const q = { point: { x: 0, z: 8 }, setback: 16 };
    const paths = check(f, [q]);
    expect(paths.access(q.point, 'walk', 16)[0]!.lane).toContain(
      `walk:${first.id}:`,
    );
    first.elevated = true;
    second.elevated = true;
    f.lanes.sync(f.world.nodes, f.world.segments);
    paths.sync(f.world.nodes, f.world.segments);
    expect(paths.access(q.point, 'drive', 16)).toEqual([]);
    expect(paths.access(q.point, 'walk', 16)).toEqual([]);
  });
});
