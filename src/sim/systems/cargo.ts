import { MAP_SIZE } from '../../data/config';
import { CARGO as C } from '../../data/cargo';
import { TrafficKind } from '../../data/traffic';
import type { Shipment } from '../../world/cargo';
import type { Building, Vec2 } from '../../world/types';
import type { Route } from '../../world/routes';
import type { LaneAccess } from './pathfinding';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
import { LaneGraph } from '../../world/laneGraph';
import { RoutePlanner } from './routePlanner';
import { TrafficSystem } from './traffic';
const commercial = (b: Building) =>
  b.kind === 'zoned' && (b.defId === 'CL' || b.defId === 'CH');
const industrial = (b: Building) => b.kind === 'zoned' && b.defId === 'I';
/** Inventory changes at dispatch/arrival, never merely because a path exists. */
export class CargoSystem {
  private revision = -1;
  private cursor = 0;
  private budget = 0;
  private readonly inbound: LaneAccess[] = [];
  private readonly outbound: LaneAccess[] = [];
  private readonly buildings = new Map<number, Building>();
  private readonly changed = new Set<number>();
  constructor(
    private readonly s: SimState,
    private readonly lanes: LaneGraph,
    private readonly planner: RoutePlanner,
    private readonly traffic: TrafficSystem,
  ) {
    this.refresh();
    this.networkChanged();
  }
  private refresh(): void {
    this.buildings.clear();
    for (const b of this.s.buildings) {
      this.buildings.set(b.id, b);
      if (b.state !== 'active' || (!commercial(b) && !industrial(b))) continue;
      const rate = industrial(b)
        ? b.jobs * C.productionPerWorkerDay
        : b.jobs * C.consumptionPerJobDay;
      const capacity = Math.max(C.minimumCapacity, rate * C.storageDays);
      if (!b.cargo) {
        b.cargo = {
          stock: commercial(b)
            ? Math.min(capacity, rate * C.initialCommercialDays)
            : 0,
          capacity,
          shortage: false,
          exportBlocked: false,
        };
        this.changed.add(b.id);
      }
      if (b.cargo.capacity !== capacity) {
        b.cargo.capacity = capacity;
        b.cargo.stock = Math.min(capacity, b.cargo.stock);
        this.changed.add(b.id);
      }
    }
  }
  networkChanged(): void {
    if (this.revision === this.lanes.revision) return;
    this.revision = this.lanes.revision;
    this.planner.paths.sync(this.s.nodes, this.s.segments);
    this.inbound.length = 0;
    this.outbound.length = 0;
    const nodes = new Map(this.s.nodes.map((n) => [n.id, n])),
      roads = new Map(this.s.segments.map((r) => [r.id, r]));
    const edge = (p: Vec2) =>
      Math.max(Math.abs(p.x), Math.abs(p.z)) >=
      MAP_SIZE / 2 - C.boundaryToleranceM;
    for (const l of this.lanes.lanes.values())
      if (roads.get(l.segment)?.type === 'highway') {
        if (edge(nodes.get(l.start)!.pos))
          this.inbound.push({ lane: l.id, distance: 0 });
        if (edge(nodes.get(l.end)!.pos))
          this.outbound.push({ lane: l.id, distance: l.length });
      }
    for (const b of this.s.buildings)
      if (industrial(b) && b.cargo) {
        b.cargo.exportBlocked =
          !this.outbound.length &&
          (b.cargo.stock >= C.minimumShipment ||
            this.s.cargo.shipments.some(
              (j) => j.from === b.id && j.kind === 'export',
            ));
        this.changed.add(b.id);
      }
  }
  daily(): void {
    this.refresh();
    if (this.s.cargo.lastDay === this.s.clock.day) return;
    this.s.cargo.lastDay = this.s.clock.day;
    for (const b of this.buildings.values())
      if (b.state === 'active' && b.cargo) {
        if (industrial(b))
          b.cargo.stock = Math.min(
            b.cargo.capacity,
            b.cargo.stock + b.workers * C.productionPerWorkerDay,
          );
        else if (commercial(b)) {
          b.cargo.stock = Math.max(
            0,
            b.cargo.stock - b.jobs * C.consumptionPerJobDay,
          );
          b.cargo.shortage = b.jobs > 0 && b.cargo.stock === 0;
        }
        this.changed.add(b.id);
      }
  }
  private route(from: number, to: number, shipment?: Shipment): Route | null {
    if (this.budget <= 0) return null;
    this.budget--;
    const a = this.buildings.get(from),
      b = this.buildings.get(to);
    if ((from && a?.state !== 'active') || (to && b?.state !== 'active'))
      return null;
    const stranded = shipment && this.traffic.strandedMission(shipment.id);
    const starts = stranded
      ? this.planner.paths.recover(stranded, 'drive', stranded.lane)
      : from
        ? this.planner.paths.access(a!.pos, 'drive', a!.frontageSetbackM)
        : this.inbound;
    const goals = to
      ? this.planner.paths.access(b!.pos, 'drive', b!.frontageSetbackM)
      : this.outbound;
    return this.planner.paths.between(starts, goals, 'drive');
  }
  private incoming(id: number): number {
    let total = 0;
    for (const job of this.s.cargo.shipments)
      if (job.to === id) total += job.units;
    return total;
  }
  private need(b: Building): number {
    return Math.max(
      0,
      Math.min(
        b.cargo!.capacity,
        b.jobs * C.consumptionPerJobDay * C.reserveCommercialDays,
      ) -
        b.cargo!.stock -
        this.incoming(b.id),
    );
  }
  private dispatch(
    from: number,
    to: number,
    units: number,
    route: Route,
    kind: Shipment['kind'],
  ): void {
    const id = this.traffic.reserveMission(),
      job: Shipment = {
        id,
        from,
        to,
        units,
        kind,
        requestedTick: this.s.clock.ticks,
        retryTick: this.s.clock.ticks,
      };
    this.s.cargo.shipments.push(job);
    if (from) {
      const b = this.buildings.get(from)!;
      b.cargo!.stock -= units;
      this.changed.add(from);
    }
    this.start(job, route);
  }
  private start(job: Shipment, route: Route): void {
    this.traffic.spawnMission(
      {
        journey: {
          citizenId: -job.id,
          originId: job.from,
          destinationId: job.to,
          purpose: 6,
          mode: 1,
          requestedTick: this.s.clock.ticks,
        },
        route,
      },
      TrafficKind.truck,
    );
    job.retryTick = this.s.clock.ticks + C.retryTicks;
  }
  private deliver(): void {
    for (const id of this.traffic.takeMissionArrivals(
      new Set(this.s.cargo.shipments.map((j) => j.id)),
    )) {
      const index = this.s.cargo.shipments.findIndex((j) => j.id === id);
      if (index < 0) continue;
      const job = this.s.cargo.shipments[index]!;
      this.s.cargo.shipments.splice(index, 1);
      if (!job.to) {
        this.s.cargo.exported += job.units;
        continue;
      }
      const b = this.buildings.get(job.to);
      if (!b?.cargo || b.state !== 'active') {
        this.s.cargo.lost += job.units;
        continue;
      }
      const accepted = Math.min(job.units, b.cargo.capacity - b.cargo.stock);
      b.cargo.stock += accepted;
      b.cargo.shortage = false;
      this.changed.add(b.id);
      this.s.cargo.lost += job.units - accepted;
      if (job.kind === 'import') this.s.cargo.imported += accepted;
      else this.s.cargo.delivered += accepted;
    }
  }
  reconcile(): void {
    this.refresh();
    for (let i = this.s.cargo.shipments.length - 1; i >= 0; i--) {
      const job = this.s.cargo.shipments[i]!;
      if (
        (job.from && this.buildings.get(job.from)?.state !== 'active') ||
        (job.to && this.buildings.get(job.to)?.state !== 'active')
      ) {
        this.traffic.cancelMission(job.id);
        this.s.cargo.lost += job.units;
        this.s.cargo.shipments.splice(i, 1);
        continue;
      }
    }
  }
  /** At most eight path requests per tick, with a rotating business cursor. */
  tick(): void {
    this.reconcile();
    this.networkChanged();
    this.deliver();
    this.budget = C.requestsPerTick;
    for (let i = this.s.cargo.shipments.length - 1; i >= 0; i--) {
      const job = this.s.cargo.shipments[i]!;
      if (
        this.traffic.hasMission(job.id) ||
        job.retryTick > this.s.clock.ticks ||
        this.budget <= 0
      )
        continue;
      const route = this.route(job.from, job.to, job);
      job.retryTick = this.s.clock.ticks + C.retryTicks;
      if (job.kind === 'export') {
        const b = this.buildings.get(job.from);
        if (b?.cargo && b.cargo.exportBlocked === !!route) {
          b.cargo.exportBlocked = !route;
          this.changed.add(b.id);
        }
      }
      if (route) this.start(job, route);
    }
    const businesses = [...this.buildings.values()].filter(
      (b) => b.state === 'active' && b.cargo,
    );
    for (
      let scanned = 0;
      scanned < businesses.length &&
      this.budget > 0 &&
      this.s.cargo.shipments.length < C.maxShipments;
      scanned++
    ) {
      const b = businesses[this.cursor++ % businesses.length]!;
      if (industrial(b)) {
        if (this.s.cargo.shipments.some((j) => j.from === b.id)) continue;
        if (b.cargo!.stock < C.minimumShipment) {
          if (b.cargo!.exportBlocked) {
            b.cargo!.exportBlocked = false;
            this.changed.add(b.id);
          }
          continue;
        }
        const candidates = businesses
          .filter((c) => commercial(c) && this.need(c) >= C.minimumShipment)
          .sort(
            (a, c) =>
              Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) -
              Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z),
          );
        let sent = false;
        for (const to of candidates) {
          if (this.budget <= 1) break;
          const route = this.route(b.id, to.id);
          if (!route) continue;
          this.dispatch(
            b.id,
            to.id,
            Math.min(C.truckCapacity, b.cargo!.stock, this.need(to)),
            route,
            'local',
          );
          sent = true;
          break;
        }
        if (sent) {
          b.cargo!.exportBlocked = false;
          this.changed.add(b.id);
          continue;
        }
        if (this.budget <= 0) continue;
        const route = this.route(b.id, 0);
        b.cargo!.exportBlocked = !route;
        this.changed.add(b.id);
        if (route)
          this.dispatch(
            b.id,
            0,
            Math.min(C.truckCapacity, b.cargo!.stock),
            route,
            'export',
          );
      } else if (
        commercial(b) &&
        this.need(b) >= C.minimumShipment &&
        !this.s.cargo.shipments.some((j) => j.to === b.id)
      ) {
        // Give local stock the first chance, even when this store happens to precede its supplier in the list.
        const local = businesses.find(
          (c) =>
            industrial(c) &&
            c.cargo!.stock >= C.minimumShipment &&
            !this.s.cargo.shipments.some((j) => j.from === c.id),
        );
        if (local) {
          const route = this.route(local.id, b.id);
          if (route) {
            this.dispatch(
              local.id,
              b.id,
              Math.min(C.truckCapacity, local.cargo!.stock, this.need(b)),
              route,
              'local',
            );
            local.cargo!.exportBlocked = false;
            this.changed.add(local.id);
            continue;
          }
        }
        if (this.budget <= 0) continue;
        const route = this.route(0, b.id);
        if (route)
          this.dispatch(
            0,
            b.id,
            Math.min(C.truckCapacity, this.need(b)),
            route,
            'import',
          );
      }
    }
  }
  patches(): BuildingPatch[] {
    const result: BuildingPatch[] = [];
    for (const id of this.changed) {
      const b = this.buildings.get(id);
      if (b?.cargo) result.push({ id, cargo: { ...b.cargo } });
    }
    this.changed.clear();
    return result;
  }
}
