import { CITIZEN_RULES } from '../../data/citizens';
import { SERVICE_TYPES, type ServiceType } from '../../data/buildings';
import {
  ServiceNetwork,
  serviceDefinition,
  serviceCapacity,
  serviceDemand,
} from '../../world/services';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
/** Authoritative daily/structural service evaluation; no coverage is read back from the UI. */
export class ServiceSystem {
  private network: ServiceNetwork;
  constructor(private readonly state: SimState) {
    this.network = new ServiceNetwork(state.nodes, state.segments);
  }
  networkChanged() {
    this.network = new ServiceNetwork(this.state.nodes, this.state.segments);
  }
  update(): BuildingPatch[] {
    const s = this.state,
      changed: BuildingPatch[] = [];
    for (const type of SERVICE_TYPES) s.fields.coverage[type].fill(0);
    const providers = s.buildings.filter((b) => {
      const type = serviceDefinition(b.defId)?.service;
      return type && type !== 'deathcare';
    });
    if (!providers.length) {
      for (const b of s.buildings)
        if (Object.keys(b.coverage ?? {}).length) {
          b.coverage = {};
          changed.push({ id: b.id, coverage: {} });
        }
      return changed;
    }
    const access = new Map(
      s.buildings.map((b) => [
        b.id,
        this.network.access(b.pos, b.frontageSetbackM),
      ]),
    );
    const covers = new Map(
      s.buildings.map((b) => [
        b.id,
        {} as Partial<Record<ServiceType, number>>,
      ]),
    );
    for (const provider of providers) {
      const def = serviceDefinition(provider.defId);
      if (!def?.service) continue;
      const budget = s.budgets[def.service],
        radius = (def.radiusM ?? 0) * budget,
        capacity = serviceCapacity(def, budget),
        origin = access.get(provider.id);
      const reach = origin ? this.network.reach(origin, radius) : undefined;
      const targets = reach
        ? s.buildings.filter(
            (b) =>
              b.state === 'active' &&
              this.network.coverage(reach, access.get(b.id)) > 0,
          )
        : [];
      const targetIds = new Set(targets.map((b) => b.id));
      let students = 0;
      const c = s.citizens;
      const level = def.capacity?.educationLevel;
      for (let i = 0; level && i < c.count; i++)
        if (
          targetIds.has(c.homeId[i]!) &&
          c.education[i] === level - 1 &&
          c.age[i]! >= CITIZEN_RULES.schoolMinAge[level - 1]! &&
          c.age[i]! <= CITIZEN_RULES.schoolMaxAge[level - 1]!
        )
          students++;
      const demand = serviceDemand(def, targets, students);
      const efficiency =
        provider.state === 'active' &&
        provider.enabled !== false &&
        !provider.fire?.burning &&
        reach
          ? Math.min(1, capacity / Math.max(1, demand))
          : 0;
      const status = {
        radius,
        capacity,
        demand,
        efficiency,
        connected: !!origin,
      };
      if (JSON.stringify(provider.serviceStatus) !== JSON.stringify(status)) {
        provider.serviceStatus = status;
        changed.push({ id: provider.id, serviceStatus: status });
      }
      if (!reach || !efficiency) continue;
      for (const b of targets) {
        const values = covers.get(b.id)!;
        values[def.service] = Math.max(
          values[def.service] ?? 0,
          this.network.coverage(reach, access.get(b.id)) * efficiency,
        );
      }
      this.network.raster(
        reach,
        s.fields.coverage[def.service],
        s.fields.size,
        efficiency,
      );
    }
    for (const b of s.buildings) {
      const coverage = covers.get(b.id)!;
      if (JSON.stringify(b.coverage ?? {}) !== JSON.stringify(coverage)) {
        b.coverage = coverage;
        changed.push({ id: b.id, coverage });
      }
    }
    return changed;
  }
}
