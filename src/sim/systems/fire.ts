import { Rng } from '../../core/rng';
import { FIRE as F } from '../../data/fire';
import { SERVICE_RULES } from '../../data/simulation';
import { TrafficKind } from '../../data/traffic';
import { ServiceNetwork, serviceDefinition } from '../../world/services';
import type { Building } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { FireMission } from '../../world/fire';
import type { Route } from '../../world/routes';
import type { SimState } from '../state';
import type { RoutePlanner } from './routePlanner';
import type { TrafficSystem } from './traffic';
export function fireRoll(seed: number, id: number, day: number): number {
  return new Rng(
    seed ^ Math.imul(id, F.seedBuildingSalt) ^ Math.imul(day, F.seedDaySalt),
  ).next();
}
/** Vehicles share real lane occupancy with citizens and cargo. Only arrival extinguishes. */
export class FireSystem {
  private readonly changed = new Set<number>();
  private buildings = new Map<number, Building>();
  private network: ServiceNetwork;
  private cursor = 0;
  constructor(
    private readonly s: SimState,
    private readonly planner: RoutePlanner,
    private readonly traffic: TrafficSystem,
  ) {
    this.network = new ServiceNetwork(s.nodes, s.segments);
    this.reconcile();
  }
  networkChanged(): void {
    this.network = new ServiceNetwork(this.s.nodes, this.s.segments);
  }
  daily(): void {
    if (this.s.fire.lastDay >= this.s.clock.day) return;
    const elapsed =
      this.s.fire.lastDay < 0 ? 1 : this.s.clock.day - this.s.fire.lastDay;
    this.s.fire.lastDay = this.s.clock.day;
    for (const b of this.s.buildings) {
      if (b.state !== 'active') continue;
      if (b.fire?.burning) {
        b.fire.damage = Math.min(
          1,
          b.fire.damage +
            SERVICE_RULES.fireDamagePerDay *
              Math.min(elapsed, this.s.clock.day - b.fire.startedDay),
        );
        if (b.fire.damage >= 1) {
          b.fire.burning = false;
          b.state = 'burned';
          b.stateTimer = 0;
          b.flags = 0;
        }
        this.changed.add(b.id);
      } else if (
        fireRoll(this.s.seed, b.id, this.s.clock.day) <
        SERVICE_RULES.fireBaseChancePerDay * (1 - (b.coverage?.fire ?? 0))
      ) {
        b.fire = { burning: true, damage: 0, startedDay: this.s.clock.day };
        this.changed.add(b.id);
      }
    }
    this.reconcile();
  }
  private capacity(b: Building): number {
    const d = serviceDefinition(b.defId);
    return b.state === 'active' &&
      b.enabled !== false &&
      !b.fire?.burning &&
      d?.service === 'fire'
      ? Math.floor((d.capacity?.vehicles ?? 0) * this.s.budgets.fire)
      : 0;
  }
  reconcile(): void {
    this.buildings = new Map(this.s.buildings.map((b) => [b.id, b]));
    for (let i = this.s.fire.missions.length - 1; i >= 0; i--) {
      const m = this.s.fire.missions[i]!,
        from = this.buildings.get(m.from),
        to = this.buildings.get(m.to);
      if (
        !from ||
        !this.capacity(from) ||
        to?.state !== 'active' ||
        !to.fire?.burning
      ) {
        this.traffic.cancelMission(m.id);
        this.s.fire.missions.splice(i, 1);
      }
    }
  }
  private route(from: Building, to: Building, m?: FireMission): Route | null {
    const stranded = m && this.traffic.strandedMission(m.id);
    return stranded
      ? this.planner.paths.between(
          this.planner.paths.recover(stranded, 'drive', stranded.lane),
          this.planner.paths.access(to.pos, 'drive', to.frontageSetbackM),
          'drive',
        )
      : this.planner.paths.find(
          from.pos,
          to.pos,
          'drive',
          this.s.clock.day,
          from.frontageSetbackM,
          to.frontageSetbackM,
        );
  }
  private start(m: FireMission, route: Route): void {
    this.traffic.spawnMission(
      {
        journey: {
          citizenId: -m.id,
          originId: m.from,
          destinationId: m.to,
          purpose: 7,
          mode: 1,
          requestedTick: m.requestedTick,
        },
        route,
      },
      TrafficKind.fire,
    );
    m.retryTick = this.s.clock.ticks + F.retryTicks;
  }
  tick(): void {
    this.reconcile();
    this.planner.paths.sync(this.s.nodes, this.s.segments);
    const ids = new Set(this.s.fire.missions.map((m) => m.id));
    for (const id of this.traffic.takeMissionArrivals(ids)) {
      const i = this.s.fire.missions.findIndex((m) => m.id === id),
        m = this.s.fire.missions[i]!;
      const b = this.buildings.get(m.to)!;
      b.fire!.burning = false;
      this.changed.add(b.id);
      this.s.fire.missions.splice(i, 1);
    }
    let budget = F.requestsPerTick;
    for (const m of this.s.fire.missions) {
      if (budget <= 0) break;
      if (this.traffic.hasMission(m.id) || m.retryTick > this.s.clock.ticks)
        continue;
      budget--;
      const route = this.route(
        this.buildings.get(m.from)!,
        this.buildings.get(m.to)!,
        m,
      );
      m.retryTick = this.s.clock.ticks + F.retryTicks;
      if (route) this.start(m, route);
    }
    const assigned = new Set(this.s.fire.missions.map((m) => m.to));
    const fires = this.s.buildings.filter(
      (b) => b.state === 'active' && b.fire?.burning && !assigned.has(b.id),
    );
    for (
      let n = 0;
      n < fires.length &&
      budget > 0 &&
      this.s.fire.missions.length < F.maxMissions;
      n++
    ) {
      const b = fires[this.cursor++ % fires.length]!,
        access = this.network.access(b.pos, b.frontageSetbackM);
      if (!access) continue;
      const reach = this.network.reach(access, Infinity);
      const stations = this.s.buildings
        .map((station) => {
          const a =
            this.capacity(station) >
            this.s.fire.missions.filter((m) => m.from === station.id).length
              ? this.network.access(station.pos, station.frontageSetbackM)
              : null;
          return {
            station,
            distance: a ? this.network.distance(reach, a) : Infinity,
          };
        })
        .filter((v) => Number.isFinite(v.distance))
        .sort((a, b) => a.distance - b.distance || a.station.id - b.station.id);
      for (const { station } of stations) {
        if (budget-- <= 0) break;
        const route = this.route(station, b);
        if (!route) continue;
        const m: FireMission = {
          id: this.traffic.reserveMission(),
          from: station.id,
          to: b.id,
          requestedTick: this.s.clock.ticks,
          retryTick: this.s.clock.ticks,
        };
        this.s.fire.missions.push(m);
        this.start(m, route);
        break;
      }
    }
  }
  patches(): BuildingPatch[] {
    const patches: BuildingPatch[] = [];
    for (const id of this.changed) {
      const b = this.buildings.get(id);
      if (b)
        patches.push({
          id,
          fire: b.fire && { ...b.fire },
          state: b.state,
          stateTimer: b.stateTimer,
          flags: b.flags,
        });
    }
    this.changed.clear();
    return patches;
  }
}
