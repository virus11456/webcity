import { PATHFINDING } from '../../data/pathfinding';
import { LaneGraph } from '../../world/laneGraph';
import { JourneyStatus, TravelMode, type Journey } from '../../world/schedules';
import type { Route } from '../../world/routes';
import type { StrandedJourney } from '../../world/traffic';
import type { Building } from '../../world/types';
import type { SimState } from '../state';
import { citizenSystem } from './citizens';
import { Pathfinder } from './pathfinding';
import { ScheduleSystem } from './schedules';
export interface PlannedJourney {
  journey: Journey;
  route: Route;
}
/** Bounded worker path jobs, including failure and stale-result handling. No movement is fabricated. */
export class RoutePlanner {
  readonly paths: Pathfinder;
  private readonly origins = new Map<number, StrandedJourney>();
  private readonly ready = new Map<number, PlannedJourney>();
  private readonly buildings = new Map<number, Building>();
  constructor(
    private readonly state: SimState,
    private readonly graph: LaneGraph,
    private readonly schedules: ScheduleSystem,
  ) {
    this.paths = new Pathfinder(graph);
  }
  tick(): number {
    const s = this.state,
      c = s.citizens;
    this.paths.sync(s.nodes, s.segments);
    if (
      this.buildings.size !== s.buildings.length ||
      s.buildings.some((b) => this.buildings.get(b.id) !== b)
    ) {
      this.buildings.clear();
      for (const b of s.buildings) this.buildings.set(b.id, b);
    }
    for (const [id, job] of this.ready) {
      const i = citizenSystem(s).indexOf(id);
      if (
        i === undefined ||
        c.tripStatus[i] === JourneyStatus.none ||
        c.tripStartTick[i] !== job.journey.requestedTick ||
        c.destinationId[i] !== job.journey.destinationId ||
        job.route.revision !== this.graph.revision
      )
        this.ready.delete(id);
    }
    let calculated = 0;
    for (const journey of this.schedules.pending(PATHFINDING.requestsPerTick)) {
      if (this.ready.has(journey.citizenId)) continue;
      const from = this.buildings.get(journey.originId),
        to = this.buildings.get(journey.destinationId);
      const stranded = this.origins.get(journey.citizenId);
      if ((!from && !stranded) || !to || to.state !== 'active') {
        this.schedules.blocked(journey);
        continue;
      }
      calculated++;
      const mode = journey.mode === TravelMode.walk ? 'walk' : 'drive';
      const route = stranded
        ? this.paths.between(
            this.paths.recover(stranded, mode, stranded.lane),
            this.paths.access(to.pos, mode, to.frontageSetbackM),
            mode,
          )
        : this.paths.find(
            from!.pos,
            to.pos,
            mode,
            s.clock.day,
            from!.frontageSetbackM,
            to.frontageSetbackM,
          );
      if (route) this.ready.set(journey.citizenId, { journey, route });
      else this.schedules.blocked(journey);
    }
    return calculated;
  }
  defer(job: PlannedJourney): void {
    this.ready.set(job.journey.citizenId, job);
  }
  strand(value: StrandedJourney): void {
    this.origins.set(value.journey.citizenId, value);
    this.ready.delete(value.journey.citizenId);
  }
  clearOrigin(id: number): void {
    this.origins.delete(id);
  }
  takeReady(limit: number = PATHFINDING.requestsPerTick): PlannedJourney[] {
    const result: PlannedJourney[] = [];
    for (const [id, job] of this.ready) {
      if (result.length >= limit) break;
      result.push(job);
      this.ready.delete(id);
    }
    return result;
  }
}
