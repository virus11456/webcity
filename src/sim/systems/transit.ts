import { BUILDINGS, TRANSIT as CAPACITY } from '../../data/buildings';
import { TRANSIT as C } from '../../data/transit';
import { ZONE_PALETTE } from '../../data/palette';
import { TIME } from '../../data/config';
import { TrafficKind } from '../../data/traffic';
import { JourneyStatus, type Journey } from '../../world/schedules';
import type { BusLine, BusPassenger } from '../../world/transit';
import { lanePointAt } from '../../world/laneGraph';
import type { Vec2 } from '../../world/types';
import type { Route } from '../../world/routes';
import type { Result } from '../../bridge/protocol';
import type { SimState } from '../state';
import { citizenSystem } from './citizens';
import type { ScheduleSystem } from './schedules';
import type { TrafficSystem } from './traffic';
import type { RoutePlanner } from './routePlanner';
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
type Outcome = Omit<Result, 't' | 'reqId'>;
/** All passengers are individual scheduled journeys. Vehicles use the same lanes/signals as cars. */
export class TransitSystem {
  private revision = -1;
  private readonly routes = new Map<number, Route[]>();
  private readonly riders = new Set<number>();
  constructor(
    private s: SimState,
    private planner: RoutePlanner,
    private traffic: TrafficSystem,
    private schedules: ScheduleSystem,
  ) {
    for (const l of s.transitLines)
      for (const p of l.riders) {
        this.riders.add(p.journey.citizenId);
        const i = citizenSystem(s).indexOf(p.journey.citizenId);
        if (
          i !== undefined &&
          s.citizens.destinationId[i] === p.journey.destinationId &&
          s.citizens.tripStartTick[i] === p.journey.requestedTick
        )
          s.citizens.tripStatus[i] = JourneyStatus.moving;
      }
    planner.transit = (j) => this.request(j);
    this.networkChanged();
  }
  private depot(id: number) {
    return this.s.buildings.find(
      (b) =>
        b.id === id &&
        b.defId === 'bus_depot' &&
        b.enabled !== false &&
        b.state === 'active' &&
        b.roadDisconnectedDay === undefined,
    );
  }
  private capacity(id: number) {
    return this.depot(id)
      ? BUILDINGS.find((b) => b.id === 'bus_depot')!.capacity.vehicles
      : 0;
  }
  private stopAccess(point: Vec2) {
    return this.planner.paths
      .access(point, 'drive')
      .slice()
      .sort((a, b) => {
        const pa = lanePointAt(
          this.planner.paths.lane(a.lane, 'drive')!.points,
          a.distance,
        );
        const pb = lanePointAt(
          this.planner.paths.lane(b.lane, 'drive')!.points,
          b.distance,
        );
        return (
          distance(pa, point) - distance(pb, point) ||
          a.lane.localeCompare(b.lane)
        );
      })
      .slice(0, 1);
  }
  private ingress(from: Vec2, to: Vec2, setback = 0) {
    return this.planner.paths.between(
      this.planner.paths.access(from, 'drive', setback),
      this.stopAccess(to),
      'drive',
    );
  }
  private paths(stops: Vec2[]): Route[] | null {
    const paths: Route[] = [];
    for (let i = 0; i < stops.length; i++) {
      const r = this.planner.paths.between(
        this.stopAccess(stops[i]!),
        this.stopAccess(stops[(i + 1) % stops.length]!),
        'drive',
      );
      if (!r?.length) return null;
      paths.push(r);
    }
    return paths;
  }
  create(stops: Vec2[]): Outcome {
    if (
      this.s.transitLines.length >= C.maxLines ||
      stops.length < 2 ||
      stops.length > C.maxStops ||
      stops.some((p, i) =>
        stops.some((q, j) => j < i && distance(p, q) < C.stopSpacingM),
      )
    )
      return { ok: false, reason: 'err.busRoute' };
    this.planner.paths.sync(this.s.nodes, this.s.segments);
    const paths = this.paths(stops);
    if (!paths) return { ok: false, reason: 'err.busRoute' };
    const length = paths.reduce((sum, r) => sum + r.length, 0);
    const vehicles = Math.ceil(length / CAPACITY.busRouteMetresPerVehicle);
    const depots = this.s.buildings.filter(
      (b) =>
        this.depot(b.id) && this.ingress(b.pos, stops[0]!, b.frontageSetbackM),
    );
    if (!depots.length) return { ok: false, reason: 'err.busDepot' };
    const depot = depots.find((d) => vehicles <= this.available(d.id));
    if (!depot) return { ok: false, reason: 'err.busCapacity' };
    const id = this.s.nextId++;
    const line: BusLine = {
      id,
      depot: depot.id,
      color: (id - 1) % Object.keys(ZONE_PALETTE).length,
      stops: structuredClone(stops),
      length,
      vehicles,
      blocked: false,
      week: Math.floor(this.s.clock.day / TIME.fiscalPeriodDays),
      passengers: 0,
      revenue: 0,
      lastPassengers: 0,
      lastRevenue: 0,
      buses: [],
      riders: [],
    };
    this.s.transitLines.push(line);
    this.routes.set(id, paths);
    this.fleet(line);
    return { ok: true };
  }
  private available(depot: number): number {
    return (
      this.capacity(depot) -
      this.s.transitLines
        .filter((l) => l.depot === depot)
        .reduce((n, l) => n + l.vehicles, 0)
    );
  }
  setVehicles(id: number, vehicles: number): Outcome {
    const l = this.s.transitLines.find((l) => l.id === id);
    if (!l || !Number.isSafeInteger(vehicles) || vehicles < 0)
      return { ok: false, reason: 'err.invalidCommand' };
    if (
      vehicles > l.vehicles &&
      vehicles > l.vehicles + this.available(l.depot)
    )
      return { ok: false, reason: 'err.busCapacity' };
    if (vehicles < l.vehicles) this.releaseAll(l);
    l.vehicles = vehicles;
    this.fleet(l);
    return { ok: true };
  }
  delete(id: number): Outcome {
    const l = this.s.transitLines.find((l) => l.id === id);
    if (!l) return { ok: false, reason: 'err.invalidCommand' };
    this.releaseAll(l);
    this.s.transitLines = this.s.transitLines.filter((l) => l.id !== id);
    this.routes.delete(id);
    return { ok: true };
  }
  private fleet(l: BusLine): void {
    if (l.blocked || !this.depot(l.depot)) return;
    while (l.buses.length < l.vehicles)
      l.buses.push({
        id: this.s.nextId++,
        target: 0,
        mission: 0,
        position: { ...this.depot(l.depot)!.pos },
      });
  }
  private release(l: BusLine, p: BusPassenger): void {
    let pos = this.traffic.missionPosition(p.mission) ?? p.position;
    if (p.stage === 'riding') {
      const bus = l.buses.find((b) => b.id === p.bus);
      if (bus) pos = this.traffic.missionPosition(bus.mission) ?? bus.position;
    }
    if (p.mission) this.traffic.cancelMission(p.mission);
    if (citizenSystem(this.s).indexOf(p.journey.citizenId) === undefined) {
      this.riders.delete(p.journey.citizenId);
      return;
    }
    const intent = this.schedules.hasDestination(p.journey)
      ? p.journey
      : this.schedules.returnHome(p.journey);
    this.schedules.blocked(intent);
    const j = { ...intent, requestedTick: this.s.clock.ticks };
    this.traffic.recoverJourney({
      journey: j,
      x: pos.x,
      y: this.s.terrain.heightAt(pos.x, pos.z),
      z: pos.z,
      lane: '',
      laneDistance: 0,
    });
    this.riders.delete(j.citizenId);
  }
  private releaseAll(l: BusLine): void {
    for (const p of l.riders) this.release(l, p);
    for (const b of l.buses)
      if (b.mission) this.traffic.cancelMission(b.mission);
    l.riders = [];
    l.buses = [];
  }
  networkChanged(): void {
    this.planner.paths.sync(this.s.nodes, this.s.segments);
    const revision = this.planner.paths.graphRevision;
    if (revision === this.revision) return;
    this.revision = revision;
    for (const l of this.s.transitLines) {
      const paths = this.paths(l.stops);
      l.blocked = !paths;
      if (paths) {
        this.routes.set(l.id, paths);
        l.length = paths.reduce((sum, r) => sum + r.length, 0);
      } else {
        this.routes.delete(l.id);
        this.releaseAll(l);
      }
    }
  }
  private mission(
    route: Route,
    id: number,
    kind: number,
    destination: number,
  ): boolean {
    return this.traffic.spawnMission(
      {
        route,
        journey: {
          citizenId: -id,
          originId: 0,
          destinationId: destination,
          purpose: C.missionPurpose,
          mode: kind === TrafficKind.pedestrian ? 0 : 1,
          requestedTick: this.s.clock.ticks,
        },
      },
      kind,
    );
  }
  request(j: Journey): boolean {
    if (this.riders.has(j.citizenId)) return true;
    if (this.riders.size >= C.maxPassengers) return false;
    const from = this.s.buildings.find((b) => b.id === j.originId),
      to = this.s.buildings.find((b) => b.id === j.destinationId);
    if (!from || !to || distance(from.pos, to.pos) < C.minTripM) return false;
    for (const l of this.s.transitLines) {
      if (l.blocked || !l.vehicles || !this.depot(l.depot)) continue;
      const near = (p: Vec2) =>
        l.stops
          .map((s, i) => ({ i, d: distance(p, s) }))
          .sort((a, b) => a.d - b.d)[0]!;
      const a = near(from.pos),
        b = near(to.pos);
      if (a.i === b.i || a.d > C.catchmentM || b.d > C.catchmentM) continue;
      const access = this.planner.paths.find(
        from.pos,
        l.stops[a.i]!,
        'walk',
        this.s.clock.day,
        from.frontageSetbackM,
      );
      const egress = this.planner.paths.find(
        l.stops[b.i]!,
        to.pos,
        'walk',
        this.s.clock.day,
        0,
        to.frontageSetbackM,
      );
      if (
        !access ||
        !egress ||
        access.length > C.catchmentM ||
        egress.length > C.catchmentM
      )
        continue;
      const id = this.traffic.reserveMission();
      if (!this.mission(access, id, TrafficKind.pedestrian, l.id)) return false;
      if (!this.schedules.depart(j)) {
        this.traffic.cancelMission(id);
        return false;
      }
      l.riders.push({
        journey: { ...j },
        from: a.i,
        to: b.i,
        stage: 'access',
        mission: id,
        bus: 0,
        since: this.s.clock.ticks,
        position: { ...from.pos },
      });
      this.riders.add(j.citizenId);
      return true;
    }
    return false;
  }
  tick(): void {
    this.networkChanged();
    for (const l of this.s.transitLines) {
      l.blocked = !this.routes.has(l.id) || !this.depot(l.depot);
      const week = Math.floor(this.s.clock.day / TIME.fiscalPeriodDays);
      if (week !== l.week) {
        l.week = week;
        l.lastPassengers = l.passengers;
        l.lastRevenue = l.revenue;
        l.passengers = l.revenue = 0;
      }
      if (!this.depot(l.depot) || l.blocked || !l.vehicles) {
        this.releaseAll(l);
        continue;
      }
      this.fleet(l);
      const ids = new Set([
        ...l.buses.map((b) => b.mission),
        ...l.riders.map((p) => p.mission),
      ]);
      const arrived = new Set(this.traffic.takeMissionArrivals(ids));
      l.riders = l.riders.filter((p) => {
        const i = citizenSystem(this.s).indexOf(p.journey.citizenId);
        if (i === undefined || !this.schedules.hasDestination(p.journey)) {
          this.release(l, p);
          return false;
        }
        if (p.mission && this.traffic.strandedMission(p.mission)) {
          this.release(l, p);
          return false;
        }
        if (arrived.has(p.mission)) {
          p.mission = 0;
          if (p.stage === 'egress') {
            this.schedules.arrive(p.journey);
            this.riders.delete(p.journey.citizenId);
            return false;
          }
          p.stage = 'waiting';
          p.position = { ...l.stops[p.from]! };
          p.since = this.s.clock.ticks;
        }
        if (
          p.stage === 'waiting' &&
          this.s.clock.ticks - p.since > C.maxWaitTicks
        ) {
          this.release(l, p);
          return false;
        }
        return true;
      });
      for (const bus of l.buses) {
        if (bus.mission && this.traffic.strandedMission(bus.mission)) {
          l.blocked = true;
          this.releaseAll(l);
          break;
        }
        if (arrived.has(bus.mission)) {
          bus.mission = 0;
          bus.position = { ...l.stops[bus.target]! };
          for (const p of l.riders.filter(
            (p) =>
              p.stage === 'riding' && p.bus === bus.id && p.to === bus.target,
          )) {
            const to = this.s.buildings.find(
              (b) => b.id === p.journey.destinationId,
            )!;
            const route = this.planner.paths.find(
              bus.position,
              to.pos,
              'walk',
              this.s.clock.day,
              0,
              to.frontageSetbackM,
            );
            const id = this.traffic.reserveMission();
            if (
              route &&
              this.mission(route, id, TrafficKind.pedestrian, to.id)
            ) {
              p.stage = 'egress';
              p.mission = id;
              p.position = { ...bus.position };
            }
            // Full pedestrian capacity: remain on board and retry at the next lap, never fabricate arrival.
          }
          let aboard = l.riders.filter(
            (p) => p.stage === 'riding' && p.bus === bus.id,
          ).length;
          for (const p of l.riders)
            if (
              p.stage === 'waiting' &&
              p.from === bus.target &&
              aboard < CAPACITY.busPassengers
            ) {
              p.stage = 'riding';
              p.bus = bus.id;
              aboard++;
              l.passengers++;
              l.revenue += C.fare;
              this.s.economy.transitUnsettled =
                (this.s.economy.transitUnsettled ?? 0) + C.fare;
            }
          bus.target = (bus.target + 1) % l.stops.length;
        }
        if (bus.mission) continue;
        const prior = (bus.target + l.stops.length - 1) % l.stops.length;
        const route =
          distance(bus.position, l.stops[prior]!) < 1
            ? this.routes.get(l.id)?.[prior]
            : this.ingress(
                bus.position,
                l.stops[bus.target]!,
                this.depot(l.depot)?.frontageSetbackM,
              );
        if (!route) {
          l.blocked = true;
          this.releaseAll(l);
          break;
        }
        const id = this.traffic.reserveMission();
        if (this.mission(route, id, TrafficKind.bus, l.id)) bus.mission = id;
      }
    }
  }
}
