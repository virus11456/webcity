import { Surface, edge, at, type Arm, type Point } from './geometry';
import { ROAD_RULES as C, ROADS } from '../../data/roads';
import { ROAD_PALETTE as P } from '../../data/palette';
import { meshHeightAt } from '../../world/heightField';
import { projectCurve } from '../../world/roadCurves';
import type { RoadConstructionWorld } from '../../world/roadConstruction';
/** Concrete deck, side beams and piers, batched with the road they support. */
export function bridgeMesh(a: Arm, b: Arm, world: RoadConstructionWorld) {
  const surface = new Surface();
  if (!a.segment.elevated) return surface.data;
  const solid = (top: Point[], depth: number) => {
    const bottom = top.map((p) => ({ ...p, y: p.y - depth }));
    surface.quad(top[0]!, top[1]!, top[2]!, top[3]!, P.concrete);
    surface.quad(bottom[3]!, bottom[2]!, bottom[1]!, bottom[0]!, P.concrete);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      surface.quad(top[i]!, bottom[i]!, bottom[j]!, top[j]!, P.concrete);
    }
  };
  const end = a.samples.at(-1)!.distance - b.trim;
  const samples = [
    a.trim,
    ...a.samples.map((p) => p.distance).filter((d) => d > a.trim && d < end),
    end,
  ];
  for (let i = 1; i < samples.length; i++) {
    const from = samples[i - 1]!,
      to = samples[i]!;
    solid(
      [
        edge(a.samples, from, -a.width, -C.deckDepthM / 2),
        edge(a.samples, to, -a.width, -C.deckDepthM / 2),
        edge(a.samples, to, a.width, -C.deckDepthM / 2),
        edge(a.samples, from, a.width, -C.deckDepthM / 2),
      ],
      C.deckDepthM,
    );
  }
  const nodes = new Map(world.nodes.map((n) => [n.id, n]));
  for (let d = a.trim + C.pierSpacingM / 2; d < end; d += C.pierSpacingM) {
    const p = at(a.samples, d),
      ground = meshHeightAt(world.heights, p.x, p.z),
      top = p.y - C.deckDepthM;
    if (top - ground < C.deckDepthM) continue;
    // Do not place a support in a lower road's carriageway.
    if (
      world.segments.some(
        (s) =>
          s.id !== a.segment.id &&
          projectCurve(p, [
            nodes.get(s.start)!.pos,
            s.c1,
            s.c2,
            nodes.get(s.end)!.pos,
          ]).distance <
            ROADS[s.type].widthM / 2 + C.pierWidthM,
      )
    )
      continue;
    const h = C.pierWidthM / 2;
    solid(
      [
        { x: p.x - h, z: p.z - h, y: top },
        { x: p.x + h, z: p.z - h, y: top },
        { x: p.x + h, z: p.z + h, y: top },
        { x: p.x - h, z: p.z + h, y: top },
      ],
      top - ground,
    );
  }
  return surface.data;
}
