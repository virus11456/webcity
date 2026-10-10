import { STARTER_CITY as C } from '../data/starterCity';
import { RoadGraph } from '../world/roadGraph';
import { roadBedPatch } from '../world/roadBed';
import type { SimState } from './state';
import type { Vec2 } from '../world/types';
/** Regional access is generated once by the authority; saves keep the actual graph and terrain. */
export function addStarterCity(state: SimState): void {
  const graph = new RoadGraph(state.nextId);
  const add = (start: Vec2, end: Vec2, type: 'highway' | 'highway_ramp') =>
    graph.addRoad({
      start,
      end,
      type,
      builtDay: 0,
      paidCost: 0,
      startHeight: C.height,
      endHeight: C.height,
    });
  for (const [i, x] of C.highwayX.entries()) {
    const bounds = [-C.edge, -C.cityEdge, C.cityEdge, C.edge];
    if (i === 0) bounds.reverse();
    for (let j = 1; j < bounds.length; j++)
      add({ x, z: bounds[j - 1]! }, { x, z: bounds[j]! }, 'highway');
  }
  add(C.rampIn[0], C.rampIn[1], 'highway_ramp');
  add(C.rampOut[0], C.rampOut[1], 'highway_ramp');
  const snapshot = graph.snapshot();
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  // National sections outside the starting tile are maintained by the region.
  for (const s of snapshot.segments) {
    const a = byId.get(s.start)!.pos,
      b = byId.get(s.end)!.pos;
    if (Math.abs((a.z + b.z) / 2) > C.cityEdge) s.regional = true;
  }
  Object.assign(state, snapshot);
  const patch = roadBedPatch(
    state.terrain.heights,
    state.nodes,
    state.segments,
  );
  for (let i = 0; i < patch.indices.length; i++)
    state.terrain.heights[patch.indices[i]!] = patch.heights[i]!;
  state.terrain.revision++;
}
