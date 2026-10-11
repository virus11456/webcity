import { GARBAGE as G } from '../../data/garbage';
import { TrafficKind } from '../../data/traffic';
import {
  garbageCapacity,
  garbageDefinition,
  garbageOperational,
  type GarbageMission,
} from '../../world/garbage';
import type { Building } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { Route } from '../../world/routes';
import type { SimState } from '../state';
import type { RoutePlanner } from './routePlanner';
import type { TrafficSystem } from './traffic';
/** Pickup and depot unloading are separate physical journeys with capacity reservations. */
export class GarbageSystem {
  private buildings = new Map<number, Building>();
  private changed = new Set<number>();
  private cursor = 0;
  constructor(
    private s: SimState,
    private planner: RoutePlanner,
    private traffic: TrafficSystem,
  ) {
    this.reconcile();
  }
  private fleet(b: Building) {
    return garbageOperational(b)
      ? Math.floor(
          (garbageDefinition(b.defId)?.garbage?.trucks ?? 0) *
            this.s.budgets.garbage,
        )
      : 0;
  }
  private status() {
    for (const b of this.buildings.values())
      if (b.wasteFacility) {
        const full = b.wasteFacility.stock >= garbageCapacity(b),
          vehicles = this.s.garbage.missions.filter(
            (m) => m.from === b.id,
          ).length;
        if (
          b.wasteFacility.full !== full ||
          b.wasteFacility.vehicles !== vehicles
        ) {
          b.wasteFacility.full = full;
          b.wasteFacility.vehicles = vehicles;
          this.changed.add(b.id);
        }
      }
  }
  reconcile() {
    this.buildings = new Map(this.s.buildings.map((b) => [b.id, b]));
    for (const b of this.buildings.values())
      if (garbageDefinition(b.defId) && !b.wasteFacility) {
        b.wasteFacility = {
          stock: 0,
          processedToday: 0,
          lastDay: this.s.clock.day - 1,
          full: false,
          vehicles: 0,
        };
        this.changed.add(b.id);
      }
    for (let i = this.s.garbage.missions.length - 1; i >= 0; i--) {
      const m = this.s.garbage.missions[i]!,
        from = this.buildings.get(m.from),
        to = this.buildings.get(m.to);
      if (!from || from.state !== 'active' || (m.phase === 'collect' && !to)) {
        if (m.phase === 'return' && m.units) {
          if (to?.garbage) {
            to.garbage.stock += m.units;
            this.changed.add(to.id);
          } else this.s.garbage.lost += m.units;
        }
        this.traffic.cancelMission(m.id);
        this.s.garbage.missions.splice(i, 1);
      }
    }
    this.status();
  }
  daily() {
    this.reconcile();
    for (const b of this.buildings.values()) {
      const q = b.wasteFacility,
        def = garbageDefinition(b.defId)?.garbage;
      if (!q || !def || q.lastDay >= this.s.clock.day) continue;
      q.processedToday = garbageOperational(b)
        ? Math.min(
            q.stock,
            (def.processingUnitsPerDay ?? 0) * this.s.budgets.garbage,
          )
        : 0;
      q.stock -= q.processedToday;
      q.lastDay = this.s.clock.day;
      this.s.garbage.processed += q.processedToday;
      this.changed.add(b.id);
    }
    this.status();
  }
  private route(m: GarbageMission): Route | null {
    const from = this.buildings.get(m.phase === 'collect' ? m.from : m.to),
      to = this.buildings.get(m.phase === 'collect' ? m.to : m.from);
    if (!to) return null;
    const stranded = this.traffic.strandedMission(m.id);
    if (stranded)
      return this.planner.paths.between(
        this.planner.paths.recover(stranded, 'drive', stranded.lane),
        this.planner.paths.access(to.pos, 'drive', to.frontageSetbackM),
        'drive',
      );
    return this.planner.paths.find(
      from?.pos ?? m.pickup,
      to.pos,
      'drive',
      this.s.clock.day,
      from?.frontageSetbackM ?? m.setback,
      to.frontageSetbackM,
    );
  }
  private start(m: GarbageMission, route: Route) {
    this.traffic.spawnMission(
      {
        journey: {
          citizenId: -m.id,
          originId: m.phase === 'collect' ? m.from : m.to,
          destinationId: m.phase === 'collect' ? m.to : m.from,
          purpose: G.purpose,
          mode: 1,
          requestedTick: m.requestedTick,
        },
        route,
      },
      TrafficKind.garbage,
    );
    m.retryTick = this.s.clock.ticks + G.retryTicks;
  }
  tick() {
    this.reconcile();
    this.planner.paths.sync(this.s.nodes, this.s.segments);
    for (const id of this.traffic.takeMissionArrivals(
      new Set(this.s.garbage.missions.map((m) => m.id)),
    )) {
      const i = this.s.garbage.missions.findIndex((m) => m.id === id),
        m = this.s.garbage.missions[i]!;
      if (m.phase === 'collect') {
        const b = this.buildings.get(m.to)!;
        m.units = Math.min(m.units, b.garbage?.stock ?? 0);
        if (b.garbage) {
          b.garbage.stock -= m.units;
          this.changed.add(b.id);
        }
        this.s.garbage.collected += m.units;
        m.phase = 'return';
        m.requestedTick = this.s.clock.ticks;
        m.retryTick = this.s.clock.ticks;
      } else {
        const b = this.buildings.get(m.from)!,
          q = b.wasteFacility!;
        q.stock += m.units;
        this.changed.add(b.id);
        this.s.garbage.missions.splice(i, 1);
      }
    }
    let budget = G.requestsPerTick;
    for (const m of this.s.garbage.missions) {
      if (budget <= 0) break;
      if (this.traffic.hasMission(m.id) || m.retryTick > this.s.clock.ticks)
        continue;
      budget--;
      const route = this.route(m);
      m.retryTick = this.s.clock.ticks + G.retryTicks;
      if (route) this.start(m, route);
    }
    // Rebuild after arrivals/retries; reservations include both outbound and returning loads.
    const facilities = this.s.buildings.filter((b) => b.wasteFacility);
    const reservations = new Map<number, { vehicles: number; units: number }>();
    for (const m of this.s.garbage.missions) {
      let entry = reservations.get(m.from);
      if (!entry) {
        entry = { vehicles: 0, units: 0 };
        reservations.set(m.from, entry);
      }
      entry.vehicles++;
      entry.units += m.units;
    }
    const assigned = new Set(
      this.s.garbage.missions
        .filter((m) => m.phase === 'collect')
        .map((m) => m.to),
    );
    const targets = this.s.buildings.filter(
      (b) =>
        (b.garbage?.stock ?? 0) >= G.minimumPickup &&
        !assigned.has(b.id) &&
        !b.fire?.burning,
    );
    for (
      let n = 0;
      n < targets.length &&
      budget > 0 &&
      this.s.garbage.missions.length < G.maxMissions;
      n++
    ) {
      const to = targets[this.cursor++ % targets.length]!;
      const providers = facilities
        .filter(
          (b) =>
            this.fleet(b) > (reservations.get(b.id)?.vehicles ?? 0) &&
            garbageCapacity(b) -
              b.wasteFacility!.stock -
              (reservations.get(b.id)?.units ?? 0) >=
              G.minimumPickup,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.pos.x - to.pos.x, a.pos.z - to.pos.z) -
              Math.hypot(b.pos.x - to.pos.x, b.pos.z - to.pos.z) || a.id - b.id,
        );
      for (const from of providers) {
        if (budget-- <= 0) break;
        const m: GarbageMission = {
          id: 0,
          from: from.id,
          to: to.id,
          phase: 'collect',
          pickup: { ...to.pos },
          setback: to.frontageSetbackM ?? 0,
          units: Math.min(
            G.truckCapacity,
            to.garbage!.stock,
            garbageCapacity(from) -
              from.wasteFacility!.stock -
              (reservations.get(from.id)?.units ?? 0),
          ),
          requestedTick: this.s.clock.ticks,
          retryTick: this.s.clock.ticks,
        };
        const route = this.route(m);
        if (!route) continue;
        m.id = this.traffic.reserveMission();
        this.s.garbage.missions.push(m);
        const reservation = reservations.get(from.id) ?? {
          vehicles: 0,
          units: 0,
        };
        reservation.vehicles++;
        reservation.units += m.units;
        reservations.set(from.id, reservation);
        this.start(m, route);
        break;
      }
    }
    this.status();
  }
  patches(): BuildingPatch[] {
    const patches: BuildingPatch[] = [];
    for (const id of this.changed) {
      const b = this.buildings.get(id);
      if (b)
        patches.push({
          id,
          ...(b.garbage ? { garbage: { ...b.garbage } } : {}),
          ...(b.wasteFacility ? { wasteFacility: { ...b.wasteFacility } } : {}),
        });
    }
    this.changed.clear();
    return patches;
  }
}
