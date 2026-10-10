import { closestPointOnSegment } from '../core/math';
import { BULLDOZE } from '../data/bulldoze';
import { ROADS } from '../data/roads';
import { sampleRoad } from './roadProfile';
import type { Building, RoadNode, RoadSegment } from './types';

/** Physical frontage access, independent of the zone block's ID after road splitting. */
export function roadAccess(
  nodes: readonly RoadNode[],
  segments: readonly RoadSegment[],
): (b: Building) => boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const paths = segments
    .filter((s) => !s.elevated && ROADS[s.type].zoning !== 'none')
    .map((s) => ({
      width: ROADS[s.type].widthM / 2 + BULLDOZE.frontageToleranceM,
      points: sampleRoad(s, byId.get(s.start)!, byId.get(s.end)!),
    }));
  return (b) =>
    paths.some((path) =>
      path.points.some(
        (p, i) =>
          i > 0 &&
          closestPointOnSegment(b.pos, path.points[i - 1]!, p).distance <=
            path.width + (b.frontageSetbackM ?? 0),
      ),
    );
}
