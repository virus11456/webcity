import { TIME } from '../../data/config';
import { PATHFINDING } from '../../data/pathfinding';
import { TRAFFIC_RUNTIME as C, TrafficKind } from '../../data/traffic';
import { TRAFFIC } from '../../data/simulation';
import { SCHEDULES } from '../../data/schedules';
import { INTERSECTIONS } from '../../data/intersections';
import { LaneGraph, lanePointAt } from '../../world/laneGraph';
import { signalGroups, greenGroup } from '../../world/intersections';
import { JourneyStatus, TravelMode } from '../../world/schedules';
import {
  saveRoute,
  type TrafficInfo,
  type SavedVehicle,
  type TrafficState,
  type StrandedJourney,
} from '../../world/traffic';
import type { Route, RouteLeg } from '../../world/routes';
import type { RoadNode } from '../../world/types';
import type { SimState } from '../state';
import { citizenSystem } from './citizens';
import { ScheduleSystem } from './schedules';
import { RoutePlanner, type PlannedJourney } from './routePlanner';
interface Occupant {
  vehicle: Vehicle;
  key: string;
  distance: number;
}
interface Vehicle extends Omit<SavedVehicle, 'route'> {
  route: Route;
  slots: [Occupant, Occupant];
}
interface Junction {
  node: RoadNode;
  groups: number[][];
  owner: number;
}
/** Deterministic lane following. Every admission and arrival corresponds to a real personal journey. */
export class TrafficSystem {
  private readonly vehicles = new Map<number, Vehicle>();
  private readonly byCitizen = new Map<number, number>();
  private readonly occupancy = new Map<string, Occupant[]>();
  private readonly junctions = new Map<number, Junction>();
  private readonly stranded = new Map<number, StrandedJourney>();
  private revision = -1;
  private nextId = 1;
  private seconds = 0;
  private arrived = 0;
  private removedStuck = 0;
  private sampledAt = 0;
  readonly roadFlow = new Map<number, { ratio: number; count: number }>();
  constructor(
    private readonly state: SimState,
    private readonly graph: LaneGraph,
    private readonly planner: RoutePlanner,
    private readonly schedules: ScheduleSystem,
    restored?: TrafficState,
  ) {
    this.seconds =
      (state.clock.ticks * TIME.secondsPerDay[1]) / TIME.ticksPerDay;
    this.syncRoads();
    if (restored) {
      this.nextId = restored.nextId;
      this.seconds = restored.seconds || this.seconds;
      this.arrived = restored.arrived;
      this.removedStuck = restored.removedStuck;
      const routes = restored.routes.map((r) => planner.paths.restoreRoute(r));
      for (const value of restored.stranded) {
        this.stranded.set(value.journey.citizenId, structuredClone(value));
        planner.strand(value);
      }
      for (const saved of restored.vehicles) {
        const route = routes[saved.route];
        if (!route || !route.legs[saved.leg]) {
          this.schedules.blocked(saved.journey);
          const value: StrandedJourney = {
            journey: { ...saved.journey, requestedTick: state.clock.ticks },
            x: saved.x,
            y: saved.y,
            z: saved.z,
            lane: '',
            laneDistance: 0,
          };
          this.stranded.set(saved.journey.citizenId, value);
          planner.strand(value);
          continue;
        }
        const i = citizenSystem(state).indexOf(saved.journey.citizenId);
        if (i === undefined) continue;
        const v = this.make({ ...saved, route });
        this.vehicles.set(v.id, v);
        this.byCitizen.set(v.journey.citizenId, v.id);
        this.updateOccupancy(v);
        if (v.reservedNode && this.junctions.has(v.reservedNode))
          this.junctions.get(v.reservedNode)!.owner = v.id;
      }
    }
    // Pre-traffic saves could contain a requested 'moving' journey but no physical agent yet.
    const c = state.citizens;
    for (let i = 0; i < c.count; i++)
      if (
        c.tripStatus[i] === JourneyStatus.moving &&
        !this.byCitizen.has(c.id[i]!)
      )
        c.tripStatus[i] = JourneyStatus.pending;
  }
  get count(): number {
    return this.vehicles.size;
  }
  private make(data: Omit<Vehicle, 'slots'>): Vehicle {
    const v = { ...data, slots: [] as unknown as [Occupant, Occupant] };
    v.slots = [
      { vehicle: v, key: '', distance: 0 },
      { vehicle: v, key: '', distance: 0 },
    ];
    return v;
  }
  private length(v: Vehicle): number {
    return v.kind === TrafficKind.pedestrian
      ? C.pedestrianLengthM
      : C.carLengthM;
  }
  private gap(v: Vehicle, other: Vehicle): number {
    return (
      (this.length(v) + this.length(other)) / 2 +
      (v.kind === TrafficKind.pedestrian
        ? C.pedestrianGapM
        : TRAFFIC.safetyGapM)
    );
  }
  private slot(slot: Occupant, key: string, distance: number): void {
    if (slot.key === key) {
      slot.distance = distance;
      return;
    }
    if (slot.key) {
      const list = this.occupancy.get(slot.key)!;
      const at = list.indexOf(slot);
      if (at >= 0) list.splice(at, 1);
    }
    slot.key = key;
    slot.distance = distance;
    if (key) {
      const list = this.occupancy.get(key) ?? [];
      let lo = 0,
        hi = list.length;
      while (lo < hi) {
        const m = (lo + hi) >>> 1;
        if (list[m]!.distance < distance) lo = m + 1;
        else hi = m;
      }
      list.splice(lo, 0, slot);
      this.occupancy.set(key, list);
    }
  }
  private updateOccupancy(v: Vehicle): void {
    const leg = v.route.legs[v.leg]!;
    let key = leg.lane ?? '',
      distance = (leg.startDistance ?? 0) + v.distance,
      second = '',
      secondDistance = 0;
    if (leg.kind === 'laneChange') {
      key = leg.fromLane!;
      second = leg.toLane!;
      const a = this.graph.lanes.get(key),
        b = this.graph.lanes.get(second);
      if (a && b) {
        const fraction = v.distance / (leg.length || 1),
          end = ((leg.toLaneDistance ?? 0) / b.length) * a.length;
        distance =
          (leg.fromLaneDistance ?? 0) +
          (end - (leg.fromLaneDistance ?? 0)) * fraction;
        secondDistance = (distance / a.length) * b.length;
      }
    }
    if (v.slots[0].key !== key && v.slots[1].key === key)
      [v.slots[0], v.slots[1]] = [v.slots[1], v.slots[0]];
    this.slot(v.slots[0], key, distance);
    this.slot(v.slots[1], second, secondDistance);
  }
  private room(
    v: Vehicle,
    key: string,
    distance: number,
    behind = false,
  ): number {
    const list = this.occupancy.get(key);
    if (!list?.length) return Infinity;
    let lo = 0,
      hi = list.length;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (list[m]!.distance < distance) lo = m + 1;
      else hi = m;
    }
    let result = Infinity;
    for (let i = lo; i < list.length; i++) {
      const item = list[i]!;
      if (item.vehicle === v) continue;
      result = item.distance - distance - this.gap(v, item.vehicle);
      break;
    }
    if (behind)
      for (let i = Math.min(lo, list.length - 1); i >= 0; i--) {
        const item = list[i]!;
        if (item.vehicle === v || item.distance > distance) continue;
        result = Math.min(
          result,
          distance -
            item.distance -
            this.gap(v, item.vehicle) -
            item.vehicle.speed * TRAFFIC.safetyHeadwaySeconds,
        );
        break;
      }
    return result;
  }
  private release(v: Vehicle): void {
    if (v.reservedNode) {
      const node = this.junctions.get(v.reservedNode);
      if (node?.owner === v.id) node.owner = 0;
      v.reservedNode = 0;
    }
  }
  private delete(v: Vehicle): void {
    this.slot(v.slots[0], '', 0);
    this.slot(v.slots[1], '', 0);
    this.release(v);
    this.vehicles.delete(v.id);
    this.byCitizen.delete(v.journey.citizenId);
  }
  private strand(v: Vehicle, stuck = false): void {
    const i = citizenSystem(this.state).indexOf(v.journey.citizenId);
    if (i !== undefined) {
      if (!this.schedules.hasDestination(v.journey))
        v.journey = this.schedules.returnHome(v.journey);
      this.schedules.blocked(v.journey);
      const leg = v.route.legs[v.leg]!,
        lane = leg.lane ?? leg.fromLane ?? '',
        value: StrandedJourney = {
          journey: { ...v.journey, requestedTick: this.state.clock.ticks },
          x: v.x,
          y: v.y,
          z: v.z,
          lane,
          laneDistance: v.slots[0].distance,
        };
      this.stranded.set(v.journey.citizenId, value);
      this.planner.strand(value);
    }
    if (stuck) this.removedStuck++;
    this.delete(v);
  }
  private syncRoads(): void {
    if (this.revision === this.graph.revision) return;
    const changed = this.revision >= 0;
    this.revision = this.graph.revision;
    this.planner.paths.sync(this.state.nodes, this.state.segments);
    this.junctions.clear();
    for (const node of this.state.nodes)
      this.junctions.set(node.id, {
        node,
        groups: signalGroups(node, this.state.segments, this.state.nodes),
        owner: 0,
      });
    if (changed) {
      const revised = new Map<Route, Route | null>();
      for (const v of this.vehicles.values()) {
        if (!revised.has(v.route)) {
          const candidate = this.planner.paths.restoreRoute(saveRoute(v.route));
          const same =
            candidate &&
            candidate.legs.every((leg, i) => {
              const old = v.route.legs[i]!;
              return (
                leg.points === old.points ||
                (leg.points.length === old.points.length &&
                  leg.points.every((p, j) => {
                    const q = old.points[j]!;
                    return (
                      Math.abs(p.x - q.x) +
                        Math.abs(p.y - q.y) +
                        Math.abs(p.z - q.z) <
                      1e-4
                    );
                  }))
              );
            });
          revised.set(v.route, same ? candidate : null);
        }
        const route = revised.get(v.route);
        if (!route) {
          this.strand(v);
          continue;
        }
        v.route = route;
        if (v.reservedNode && this.junctions.has(v.reservedNode))
          this.junctions.get(v.reservedNode)!.owner = v.id;
      }
    }
  }
  networkChanged(): void {
    this.syncRoads();
  }
  /** Return false to leave a queued request pending when its driveway or capacity is occupied. */
  spawn(job: PlannedJourney): boolean {
    if (
      this.vehicles.size >= C.capacity ||
      this.byCitizen.has(job.journey.citizenId) ||
      job.route.revision !== this.graph.revision ||
      !job.route.legs.length
    )
      return false;
    const first = job.route.legs[0]!,
      point = lanePointAt(first.points, first.startDistance ?? 0);
    const v = this.make({
      id: this.nextId,
      journey: job.journey,
      route: job.route,
      kind:
        job.journey.mode === TravelMode.walk
          ? TrafficKind.pedestrian
          : TrafficKind.car,
      leg: 0,
      distance: 0,
      speed: 0,
      stopped: 0,
      stopWait: 0,
      reservedNode: 0,
      x: point.x,
      y: point.y,
      z: point.z,
      yaw: 0,
    });
    if (
      first.lane &&
      this.room(v, first.lane, first.startDistance ?? 0, true) < 0
    )
      return false;
    if (first.lane) {
      const node = this.planner.paths.lane(first.lane, job.route.mode)?.start;
      if (
        node &&
        this.junctions.get(node)?.owner &&
        (first.startDistance ?? 0) < this.length(v) + TRAFFIC.safetyGapM
      )
        return false;
    }
    if (!this.schedules.depart(job.journey)) return false;
    this.vehicles.set(v.id, v);
    this.byCitizen.set(v.journey.citizenId, v.id);
    this.updateOccupancy(v);
    this.pose(v);
    this.stranded.delete(v.journey.citizenId);
    this.planner.clearOrigin(v.journey.citizenId);
    do {
      this.nextId = this.nextId >= C.maxVehicleId ? 1 : this.nextId + 1;
    } while (this.vehicles.has(this.nextId));
    return true;
  }
  private canEnter(v: Vehicle, connection: RouteLeg): boolean {
    const junction = this.junctions.get(connection.node!);
    if (!junction) return false;
    if (v.reservedNode === junction.node.id) return true;
    const controlled =
      junction.node.segments.length >= 3 || junction.node.control !== 'none';
    if (controlled && junction.owner && junction.owner !== v.id) return false;
    if (v.kind !== TrafficKind.pedestrian) {
      if (junction.node.control === 'lights') {
        const incoming = this.graph.lanes.get(connection.fromLane!)?.segment;
        if (
          incoming === undefined ||
          !greenGroup(junction.groups, this.seconds).includes(incoming)
        )
          return false;
      }
      if (junction.node.control === 'stop' && v.stopWait < C.stopWaitSeconds)
        return false;
    }
    const to = connection.toLane!;
    if (this.room(v, to, 0) < this.length(v) + TRAFFIC.safetyGapM) return false;
    if (controlled) {
      junction.owner = v.id;
      v.reservedNode = junction.node.id;
    }
    return true;
  }
  private move(v: Vehicle, amount: number): number {
    let moved = 0;
    for (
      let transitions = 0;
      amount > 0 && transitions < C.maxTransitionsPerStep;
      transitions++
    ) {
      const leg = v.route.legs[v.leg]!,
        remaining = leg.length - v.distance,
        next = v.route.legs[v.leg + 1];
      let allowed = remaining;
      if (leg.lane)
        allowed = Math.min(
          allowed,
          Math.max(
            0,
            this.room(v, leg.lane, (leg.startDistance ?? 0) + v.distance),
          ),
        );
      if (leg.kind === 'laneChange') {
        const a = this.graph.lanes.get(leg.fromLane!),
          b = this.graph.lanes.get(leg.toLane!);
        if (a && b) {
          const spanA =
            ((leg.toLaneDistance ?? 0) / b.length) * a.length -
            (leg.fromLaneDistance ?? 0);
          const spanB = (spanA / a.length) * b.length;
          allowed = Math.min(
            allowed,
            (Math.max(0, this.room(v, a.id, v.slots[0].distance)) *
              leg.length) /
              Math.max(1e-6, spanA),
            (Math.max(0, this.room(v, b.id, v.slots[1].distance)) *
              leg.length) /
              Math.max(1e-6, spanB),
          );
        }
      }
      if (next?.node && next.fromLane) {
        const offset =
          (v.kind === TrafficKind.pedestrian
            ? C.pedestrianStopOffsetM
            : INTERSECTIONS.stopLineOffsetM) +
          this.length(v) / 2;
        const gate = Math.max(0, leg.length - offset);
        if (
          v.distance + Math.min(amount, allowed) >= gate &&
          !this.canEnter(v, next)
        )
          allowed = Math.min(allowed, Math.max(0, gate - v.distance));
      }
      if (next?.kind === 'laneChange') {
        const to = this.graph.lanes.get(next.toLane!)!,
          from = this.graph.lanes.get(next.fromLane!)!;
        const position =
          ((next.fromLaneDistance ?? 0) / from.length) * to.length;
        if (
          v.distance + Math.min(amount, allowed) >= leg.length &&
          this.room(v, to.id, position, true) < 0
        )
          allowed = Math.min(allowed, Math.max(0, remaining - 0.01));
      }
      const step = Math.max(0, Math.min(amount, allowed));
      v.distance += step;
      moved += step;
      amount -= step;
      this.updateOccupancy(v);
      if (
        v.reservedNode &&
        leg.lane &&
        this.planner.paths.lane(leg.lane, v.route.mode)?.start ===
          v.reservedNode &&
        (leg.startDistance ?? 0) + v.distance >=
          this.length(v) + TRAFFIC.safetyGapM
      )
        this.release(v);
      if (v.distance < leg.length - 1e-6) break;
      if (!next) {
        if (this.schedules.arrive(v.journey)) {
          this.arrived++;
          this.delete(v);
        } else this.strand(v);
        return moved;
      }
      if (next.lane && this.room(v, next.lane, next.startDistance ?? 0) < 0)
        break;
      v.leg++;
      v.distance = 0;
      this.updateOccupancy(v);
      // Keep the next lane clear at the moment of entry, including an earlier vehicle in this same step.
      if (next.lane && this.room(v, next.lane, next.startDistance ?? 0) < 0)
        break;
    }
    return moved;
  }
  private pose(v: Vehicle): void {
    const leg = v.route.legs[v.leg]!,
      points = leg.points,
      d = Math.max(
        0,
        Math.min(
          points.at(-1)!.distance,
          (leg.startDistance ?? 0) + v.distance,
        ),
      );
    let lo = 0,
      hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (points[mid]!.distance < d) lo = mid;
      else hi = mid;
    }
    const a = points[lo]!,
      b = points[hi]!,
      t = (d - a.distance) / (b.distance - a.distance || 1);
    v.x = a.x + (b.x - a.x) * t;
    v.y = a.y + (b.y - a.y) * t;
    v.z = a.z + (b.z - a.z) * t;
    if (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > 1e-6)
      v.yaw = Math.atan2(b.x - a.x, b.z - a.z);
  }
  step(seconds: number, absoluteSeconds?: number): void {
    if (seconds <= 0) return;
    this.syncRoads();
    this.seconds = absoluteSeconds ?? this.seconds + seconds;
    const c = this.state.citizens;
    for (const [id] of this.stranded)
      if (citizenSystem(this.state).indexOf(id) === undefined) {
        this.stranded.delete(id);
        this.planner.clearOrigin(id);
      }
    for (const job of this.planner.takeReady(
      Math.max(
        0,
        Math.min(PATHFINDING.requestsPerTick, C.capacity - this.count),
      ),
    ))
      if (!this.spawn(job)) this.planner.defer(job);
    for (const v of this.vehicles.values()) {
      const i = citizenSystem(this.state).indexOf(v.journey.citizenId);
      if (i === undefined || c.tripStatus[i] !== JourneyStatus.moving) {
        this.delete(v);
        continue;
      }
      if (!this.schedules.hasDestination(v.journey)) {
        this.strand(v);
        continue;
      }
      const leg = v.route.legs[v.leg]!,
        dt = seconds * SCHEDULES.movementSpeedScale;
      const free = leg.speedMps,
        front = v.slots[0].key
          ? this.room(v, v.slots[0].key, v.slots[0].distance)
          : Infinity;
      const desired = Math.min(
        free,
        Math.max(0, front / TRAFFIC.safetyHeadwaySeconds),
      );
      v.speed = Math.min(desired, v.speed + C.accelerationMps2 * dt);
      const moved = this.move(v, v.speed * dt);
      if (!this.vehicles.has(v.id)) continue;
      v.speed = moved / dt;
      v.stopped = moved < C.stoppedDistanceM ? v.stopped + seconds : 0;
      v.stopWait = v.speed < C.stoppedSpeedMps ? v.stopWait + seconds : 0;
      this.pose(v);
      if (v.stopped >= TRAFFIC.despawnStuckGameSeconds) this.strand(v, true);
    }
    if (this.seconds - this.sampledAt >= C.congestionSampleSeconds) {
      this.sampledAt = this.seconds;
      const sums = new Map<number, { sum: number; count: number }>();
      for (const v of this.vehicles.values())
        if (v.kind !== TrafficKind.pedestrian) {
          const leg = v.route.legs[v.leg]!,
            sum = sums.get(leg.segment) ?? { sum: 0, count: 0 };
          sum.sum += Math.min(1, v.speed / leg.speedMps);
          sum.count++;
          sums.set(leg.segment, sum);
        }
      this.roadFlow.clear();
      for (const s of this.state.segments) {
        const value = sums.get(s.id);
        this.roadFlow.set(s.id, {
          ratio: value ? value.sum / value.count : 1,
          count: value?.count ?? 0,
        });
      }
      this.planner.paths.setCongestion(
        new Map([...this.roadFlow].map(([id, v]) => [id, v.ratio])),
      );
    }
  }
  frame(): { data: Float32Array; count: number } {
    const data = new Float32Array(this.count * C.streamStride);
    let i = 0;
    for (const v of this.vehicles.values()) {
      data[i] = v.id;
      data[i + 1] = v.journey.citizenId;
      data[i + 2] = v.kind;
      data[i + 3] = v.x;
      data[i + 4] = v.y;
      data[i + 5] = v.z;
      data[i + 6] = v.yaw;
      data[i + 7] = v.speed;
      data[i + 8] = this.length(v);
      data[i + 9] = v.journey.destinationId;
      i += C.streamStride;
    }
    return { data, count: this.count };
  }
  inspect(id: number): TrafficInfo | null {
    const v = this.vehicles.get(id);
    if (!v) return null;
    const i = citizenSystem(this.state).indexOf(v.journey.citizenId);
    return {
      id: v.id,
      citizenId: v.journey.citizenId,
      kind: v.kind,
      homeId: i === undefined ? 0 : this.state.citizens.homeId[i]!,
      workId: i === undefined ? 0 : this.state.citizens.workId[i]!,
      destinationId: v.journey.destinationId,
      purpose: v.journey.purpose,
      x: v.x,
      y: v.y,
      z: v.z,
      speed: v.speed,
    };
  }
  snapshot(): TrafficState {
    for (const v of this.vehicles.values())
      if (citizenSystem(this.state).indexOf(v.journey.citizenId) === undefined)
        this.delete(v);
    for (const [id] of this.stranded)
      if (citizenSystem(this.state).indexOf(id) === undefined) {
        this.stranded.delete(id);
        this.planner.clearOrigin(id);
      }
    const routes: ReturnType<typeof saveRoute>[] = [],
      byRoute = new Map<Route, number>(),
      vehicles: SavedVehicle[] = [];
    for (const v of this.vehicles.values()) {
      let index = byRoute.get(v.route);
      if (index === undefined) {
        index = routes.length;
        routes.push(saveRoute(v.route));
        byRoute.set(v.route, index);
      }
      const { slots, route, ...saved } = v;
      void slots;
      void route;
      vehicles.push({ ...saved, journey: { ...v.journey }, route: index });
    }
    return {
      version: 1,
      nextId: this.nextId,
      seconds: this.seconds,
      arrived: this.arrived,
      removedStuck: this.removedStuck,
      routes,
      vehicles,
      stranded: [...this.stranded.values()].map((v) => ({
        ...v,
        journey: { ...v.journey },
      })),
    };
  }
}
