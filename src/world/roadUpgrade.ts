import { GAME_MODES } from '../data/config';
import { ROADS, type RoadTypeId } from '../data/roads';
import { ROAD_RULES } from '../data/roads';
import { BULLDOZE } from '../data/bulldoze';
import { projectCurve, curveSamples } from './roadCurves';
import { distance } from '../core/math';
import { previewStraightRoad, roadConstructionCost } from './roadGeometry';
import type {
  RoadConstructionWorld,
  ConstructionPreview,
} from './roadConstruction';
import { zoneBuildingFootprint, zonePolygonsOverlap } from './zoneGeometry';
import type { RoadSegment, Vec2 } from './types';
export function pickUpgradeRoad(
  w: RoadConstructionWorld,
  p: Vec2,
): number | undefined {
  const nodes = new Map(w.nodes.map((n) => [n.id, n]));
  return w.segments
    .map((s) => ({
      id: s.id,
      d: projectCurve(p, [
        nodes.get(s.start)!.pos,
        s.c1,
        s.c2,
        nodes.get(s.end)!.pos,
      ]).distance,
      width: ROADS[s.type].widthM / 2 + BULLDOZE.pointerRadiusM,
    }))
    .filter((s) => s.d <= s.width)
    .sort((a, b) => a.d - b.d || a.id - b.id)[0]?.id;
}
export function previewRoadUpgrade(
  w: RoadConstructionWorld,
  id: number,
  type: RoadTypeId,
): {
  result: ConstructionPreview;
  segment?: RoadSegment;
  removedBuildingIndices: number[];
} {
  const reject = (reason: ConstructionPreview['reason']) => ({
    result: { canBuild: false, reason, preview: null },
    removedBuildingIndices: [],
  });
  const old = w.segments.find((s) => s.id === id);
  if (!old || !Object.hasOwn(ROADS, type)) return reject('err.invalidCommand');
  if (
    !GAME_MODES[w.mode].allUnlocked &&
    !w.unlocked.includes(ROADS[type].unlock)
  )
    return reject('err.roadLocked');
  const segment = structuredClone(old);
  segment.type = type;
  if (type === old.type && ROADS[type].lanesBackward === 0) {
    segment.zoningReversed = !old.zoningReversed;
    [segment.start, segment.end] = [segment.end, segment.start];
    [segment.c1, segment.c2] = [segment.c2, segment.c1];
  }
  const nodes = new Map(w.nodes.map((n) => [n.id, n])),
    a = nodes.get(segment.start)!,
    b = nodes.get(segment.end)!;
  const result = previewStraightRoad(
    {
      type,
      start: a.pos,
      end: b.pos,
      c1: segment.c1,
      c2: segment.c2,
      snap: { angle: false, length: false, connections: 'exact' },
    },
    {
      ...w,
      segments: w.segments.filter((s) => s.id !== id),
      nodes: w.nodes.map((n) => ({
        ...n,
        segments: n.segments.filter((s) => s !== id),
      })),
      buildings: [],
    },
  );
  if (!result.canBuild || !result.preview)
    return { result, removedBuildingIndices: [] };
  const cost = GAME_MODES[w.mode].unlimitedMoney
    ? 0
    : Math.max(
        0,
        roadConstructionCost(type, old.length) -
          roadConstructionCost(old.type, old.length),
      );
  result.preview.cost = cost;
  if (cost > w.money)
    return {
      ...reject('err.notEnoughMoney'),
      result: { ...result, canBuild: false, reason: 'err.notEnoughMoney' },
    };
  const curve = [a.pos, segment.c1, segment.c2, b.pos] as const,
    points = curveSamples(curve),
    half = ROADS[type].widthM / 2;
  const footprints = points.slice(1).map((v, i) => {
    const p = points[i]!.point,
      q = v.point,
      l = distance(p, q) || 1,
      nx = (-(q.z - p.z) / l) * half,
      nz = ((q.x - p.x) / l) * half;
    return [
      { x: p.x + nx, z: p.z + nz },
      { x: p.x - nx, z: p.z - nz },
      { x: q.x - nx, z: q.z - nz },
      { x: q.x + nx, z: q.z + nz },
    ];
  });
  const removedBuildingIndices =
    ROADS[type].widthM <= ROADS[old.type].widthM
      ? []
      : w.buildings.flatMap((b, i) =>
          footprints.some((p) =>
            zonePolygonsOverlap(p, zoneBuildingFootprint(b)),
          )
            ? [i]
            : [],
        );
  return { result, segment, removedBuildingIndices };
}
/** Preserve earned refund age; an old road upgrade cannot make old construction refundable again. */
export function upgradedPayment(old: RoadSegment, cost: number, day: number) {
  return day - old.builtDay < ROAD_RULES.refundDays
    ? { paidCost: (old.paidCost ?? 0) + cost, builtDay: old.builtDay }
    : cost > 0
      ? { paidCost: cost, builtDay: day }
      : { paidCost: old.paidCost, builtDay: old.builtDay };
}
