import { ROAD_MESH as C } from '../data/roadMesh';
import { LANE_GRAPH as L } from '../data/laneGraph';
export interface JunctionArm {
  id: number;
  angle: number;
  width: number;
  length: number;
}
/** Shared road-surface and lane-path portal distances. */
export function junctionTrims(
  input: readonly JunctionArm[],
): Map<number, number> {
  const arms = [...input].sort((a, b) => a.angle - b.angle),
    result = new Map(arms.map((a) => [a.id, 0]));
  if (
    arms.length < 2 ||
    (arms.length === 2 &&
      Math.abs(Math.abs(arms[0]!.angle - arms[1]!.angle) - Math.PI) <
        L.straightJunctionTolerance &&
      arms[0]!.width === arms[1]!.width)
  )
    return result;
  let reach = 0;
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i]!,
      b = arms[(i + 1) % arms.length]!,
      angle = (b.angle - a.angle + Math.PI * 2) % (Math.PI * 2);
    reach = Math.max(
      reach,
      Math.max(a.width, b.width) /
        Math.max(L.minimumTangentDenominator, Math.abs(Math.tan(angle / 2))) +
        C.cornerRadiusM,
    );
  }
  for (const a of arms)
    result.set(a.id, Math.min(reach, a.length * C.maxTrimFraction));
  return result;
}
