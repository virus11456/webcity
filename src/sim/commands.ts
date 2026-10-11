import { isTerraformDraft } from '../world/terraform';
import {
  INDUSTRY_SPECIALIZATIONS,
  type IndustrySpecializationId,
} from '../data/policies';
import { POLICIES, type PolicyId } from '../data/policies';
import { PARKS } from '../data/parks';
import { TRAFFIC_RUNTIME } from '../data/traffic';
import { SIM_RUNTIME } from '../data/simRuntime';
import type { BudgetDepartment } from '../data/economy';
import { finitePoint } from '../world/power';
import { isBulldozeTargets } from '../world/bulldoze';
import { isZonePayload } from '../world/zoning';
import type { ZoneType } from '../world/types';
import { ROADS, type RoadTypeId } from '../data/roads';
import { isRoadDraft } from '../world/roadConstruction';
import type { Response, SimEvent } from '../bridge/protocol';
import type { CitySettings } from '../world/snapshot';
import { Simulation } from './simulation';

const futureCommands = new Set([
  'setDisasters',
  'rebuild',
  'load',
  'createBusLine',
  'setBusVehicles',
  'deleteBusLine',
  'save',
  'upgradeRoad',
  'place',
  'plantTrees',
  'setBuildingEnabled',
  'buildNetwork',
  'buildRoadPipes',
  'terraform',
  'undo',
  'setTax',
  'setBudget',
  'takeLoan',
  'repayLoan',
  'buyTile',
  'setPolicy',
  'inspect',
]);

/** Runtime validation at the worker boundary; future commands fail explicitly. */
export class CommandDispatcher {
  private simulation: Simulation | undefined;
  private loading = false;
  private streamElapsed = 0;
  private streamedVehicles = false;
  constructor(
    private readonly emit: (event: SimEvent) => void,
    private readonly persistence?: {
      serialize(
        snapshot: import('../world/snapshot').WorldSnapshot,
      ): Promise<ArrayBuffer>;
      deserialize(
        data: ArrayBuffer,
      ): Promise<import('../world/snapshot').WorldSnapshot>;
    },
  ) {}

  /** Dispatch an untrusted structured-clone payload without exposing authority. */
  handle(value: unknown): void {
    if (
      !value ||
      typeof value !== 'object' ||
      !('reqId' in value) ||
      !Number.isSafeInteger(value.reqId) ||
      (value.reqId as number) <= 0
    ) {
      this.emit({ t: 'error', message: 'err.invalidCommand' });
      return;
    }
    const reqId = value.reqId as number;
    const fail = (reason: Extract<Response, { t: 'result' }>['reason']) =>
      this.emit({ t: 'result', reqId, ok: false, reason });
    if (!('t' in value) || typeof value.t !== 'string') {
      fail('err.invalidCommand');
      return;
    }
    if (this.loading) {
      fail('err.notReady');
      return;
    }
    if (
      (value.t === 'load' || value.t === 'init') &&
      'tileLimit' in value &&
      ![4, 9].includes(value.tileLimit as number)
    ) {
      fail('err.invalidCommand');
      return;
    }
    if (value.t === 'load' && this.persistence) {
      if (!('data' in value) || !(value.data instanceof ArrayBuffer)) {
        fail('err.invalidCommand');
        return;
      }
      this.loading = true;
      void this.persistence
        .deserialize(value.data)
        .then((snapshot) => {
          const next = new Simulation(
            snapshot.settings,
            this.emit,
            snapshot,
            'tileLimit' in value ? (value.tileLimit as 4 | 9) : undefined,
          );
          const restored = next.snapshot();
          this.simulation = next;
          this.streamElapsed = 0;
          this.streamedVehicles = false;
          this.emit({ t: 'ready', reqId, snapshot: restored });
        })
        .catch(() => fail('err.invalidCommand'))
        .finally(() => {
          this.loading = false;
        });
      return;
    }
    if (value.t === 'save' && this.persistence) {
      if (!this.simulation) {
        fail('err.notReady');
        return;
      }
      const snapshot = this.simulation.snapshot();
      void this.persistence
        .serialize(snapshot)
        .then((data) =>
          this.emit({
            t: 'saved',
            reqId,
            data,
            metadata: {
              settings: snapshot.settings,
              population: snapshot.stats.population,
              day: snapshot.clock.day,
            },
          }),
        )
        .catch(() => fail('err.invalidCommand'));
      return;
    }
    if (value.t === 'init') {
      if (
        !('seed' in value) ||
        !('mapId' in value) ||
        !('mode' in value) ||
        !('cityName' in value)
      ) {
        fail('err.invalidCommand');
        return;
      }
      try {
        // createState validates every init field before generating a map.
        const next = new Simulation(
          {
            seed: value.seed,
            mapId: value.mapId,
            mode: value.mode,
            cityName: value.cityName,
            ...('starterRoads' in value && value.starterRoads === true
              ? { starterRoads: true }
              : {}),
          } as CitySettings,
          this.emit,
          undefined,
          'tileLimit' in value ? (value.tileLimit as 4 | 9) : undefined,
        );
        const snapshot = next.snapshot();
        this.simulation = next;
        this.streamElapsed = 0;
        this.streamedVehicles = false;
        this.emit({ t: 'ready', reqId, snapshot });
      } catch {
        fail('err.invalidCommand');
      }
      return;
    }
    if (
      value.t !== 'setSpeed' &&
      value.t !== 'buildRoad' &&
      value.t !== 'setIntersection' &&
      value.t !== 'zone' &&
      value.t !== 'bulldoze' &&
      value.t !== 'district' &&
      !futureCommands.has(value.t)
    ) {
      fail('err.invalidCommand');
      return;
    }
    if (!this.simulation) {
      fail('err.notReady');
      return;
    }
    if (value.t === 'buyTile') {
      if (
        !('tx' in value) ||
        !('tz' in value) ||
        !Number.isSafeInteger(value.tx) ||
        !Number.isSafeInteger(value.tz)
      )
        fail('err.invalidCommand');
      else
        this.emit({
          t: 'result',
          reqId,
          ...this.simulation.buyTile(value.tx as number, value.tz as number),
        });
      return;
    }
    if (value.t === 'inspect') {
      if (
        !('target' in value) ||
        !value.target ||
        typeof value.target !== 'object' ||
        !('kind' in value.target) ||
        typeof value.target.kind !== 'string' ||
        !('id' in value.target) ||
        !Number.isSafeInteger(value.target.id)
      ) {
        fail('err.invalidCommand');
        return;
      }
      const info = this.simulation.inspect(
        value.target.kind,
        value.target.id as number,
      );
      if (info) this.emit({ t: 'inspectResult', reqId, info });
      else fail('err.bulldozeMissing');
      return;
    }
    if (this.simulation.gameOver) {
      fail('err.gameOver');
      return;
    }
    if (value.t === 'undo') {
      this.emit({ t: 'result', reqId, ...this.simulation.undo() });
      return;
    }
    if (value.t === 'setDisasters') {
      if (!('enabled' in value) || typeof value.enabled !== 'boolean')
        fail('err.invalidCommand');
      else
        this.emit({
          t: 'result',
          reqId,
          ...this.simulation.setDisasters(value.enabled),
        });
      return;
    }
    if (value.t === 'rebuild') {
      if (!('id' in value) || !Number.isSafeInteger(value.id))
        fail('err.invalidCommand');
      else
        this.emit({
          t: 'result',
          reqId,
          ...this.simulation.rebuild(value.id as number),
        });
      return;
    }
    if (value.t === 'terraform') {
      if (!('draft' in value) || !isTerraformDraft(value.draft))
        fail('err.invalidCommand');
      else
        this.emit({
          t: 'result',
          reqId,
          ...this.simulation.terraform(value.draft),
        });
      return;
    }
    if (value.t === 'setPolicy') {
      if (
        !('policy' in value) ||
        !POLICIES.some((p) => p.id === value.policy) ||
        !('district' in value) ||
        (value.district !== null && !Number.isSafeInteger(value.district)) ||
        !('on' in value) ||
        (typeof value.on !== 'boolean' && value.on !== null)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...this.simulation.setPolicy(
          value.policy as PolicyId,
          value.district as number | null,
          value.on,
        ),
      });
      return;
    }
    if (value.t === 'district') {
      if (!('action' in value)) {
        fail('err.invalidCommand');
        return;
      }
      let command: import('../world/districts').DistrictAction | undefined;
      if (
        value.action === 'create' &&
        'name' in value &&
        typeof value.name === 'string'
      )
        command = { action: 'create', name: value.name };
      else if ('id' in value && Number.isSafeInteger(value.id)) {
        if (
          value.action === 'rename' &&
          'name' in value &&
          typeof value.name === 'string'
        )
          command = {
            action: 'rename',
            id: value.id as number,
            name: value.name,
          };
        else if (
          value.action === 'specialize' &&
          'industry' in value &&
          (value.industry === null ||
            INDUSTRY_SPECIALIZATIONS.some((d) => d.id === value.industry))
        )
          command = {
            action: 'specialize',
            id: value.id as number,
            industry: value.industry as IndustrySpecializationId | null,
          };
        else if (value.action === 'delete')
          command = { action: 'delete', id: value.id as number };
      }
      if (
        value.action === 'paint' &&
        'id' in value &&
        (value.id === null || Number.isSafeInteger(value.id)) &&
        'points' in value &&
        Array.isArray(value.points) &&
        value.points.every(finitePoint) &&
        'radius' in value &&
        typeof value.radius === 'number'
      )
        command = {
          action: 'paint',
          id: value.id as number | null,
          points: value.points,
          radius: value.radius,
        };
      if (command)
        this.emit({
          t: 'result',
          reqId,
          ...this.simulation.districtCommand(command),
        });
      else fail('err.invalidCommand');
      return;
    }
    if (
      value.t === 'createBusLine' ||
      value.t === 'setBusVehicles' ||
      value.t === 'deleteBusLine'
    ) {
      if (
        value.t === 'createBusLine' &&
        (!('mode' in value) ||
          value.mode === 'metro' ||
          value.mode === 'tram') &&
        (!('preview' in value) || typeof value.preview === 'boolean') &&
        'stops' in value &&
        Array.isArray(value.stops) &&
        value.stops.every(finitePoint)
      )
        this.emit({
          t: 'result',
          reqId,
          ...this.simulation.busCommand({
            t: value.t,
            stops: value.stops,
            preview: 'preview' in value ? (value.preview as boolean) : false,
            ...('mode' in value
              ? { mode: value.mode as 'metro' | 'tram' }
              : {}),
          }),
        });
      else if (
        value.t === 'deleteBusLine' &&
        'id' in value &&
        Number.isSafeInteger(value.id)
      )
        this.emit({
          t: 'result',
          reqId,
          ...this.simulation.busCommand({ t: value.t, id: value.id as number }),
        });
      else if (
        value.t === 'setBusVehicles' &&
        'id' in value &&
        Number.isSafeInteger(value.id) &&
        'vehicles' in value &&
        Number.isSafeInteger(value.vehicles)
      )
        this.emit({
          t: 'result',
          reqId,
          ...this.simulation.busCommand({
            t: value.t,
            id: value.id as number,
            vehicles: value.vehicles as number,
          }),
        });
      else fail('err.invalidCommand');
      return;
    }
    if (
      value.t === 'setTax' ||
      value.t === 'setBudget' ||
      value.t === 'takeLoan' ||
      value.t === 'repayLoan'
    ) {
      let command;
      if (
        value.t === 'setTax' &&
        'zone' in value &&
        typeof value.zone === 'string' &&
        'rate' in value &&
        typeof value.rate === 'number'
      )
        command = {
          t: value.t,
          zone: value.zone as ZoneType,
          rate: value.rate,
        } as const;
      else if (
        value.t === 'setBudget' &&
        'dept' in value &&
        typeof value.dept === 'string' &&
        'value' in value &&
        typeof value.value === 'number'
      )
        command = {
          t: value.t,
          dept: value.dept as BudgetDepartment,
          value: value.value,
        } as const;
      else if (
        value.t === 'takeLoan' &&
        'bank' in value &&
        typeof value.bank === 'number'
      )
        command = { t: value.t, bank: value.bank } as const;
      else if (
        value.t === 'repayLoan' &&
        'index' in value &&
        typeof value.index === 'number'
      )
        command = { t: value.t, index: value.index } as const;
      if (!command) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({ t: 'result', reqId, ...this.simulation.finance(command) });
    } else if (value.t === 'setBuildingEnabled') {
      if (
        !('id' in value) ||
        typeof value.id !== 'number' ||
        !Number.isSafeInteger(value.id) ||
        !('enabled' in value) ||
        typeof value.enabled !== 'boolean'
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...this.simulation.setBuildingEnabled(value.id, value.enabled),
      });
    } else if (value.t === 'plantTrees') {
      if (
        !('points' in value) ||
        !Array.isArray(value.points) ||
        !value.points.length ||
        value.points.length > PARKS.maxBrushTrees ||
        !value.points.every(finitePoint)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...this.simulation.plantTrees(value.points),
      });
    } else if (value.t === 'place') {
      if (
        !('defId' in value) ||
        typeof value.defId !== 'string' ||
        !('pos' in value) ||
        !finitePoint(value.pos) ||
        !('rotation' in value) ||
        typeof value.rotation !== 'number' ||
        !Number.isFinite(value.rotation)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...this.simulation.place(value.defId, value.pos, value.rotation),
      });
    } else if (value.t === 'buildRoadPipes') {
      this.emit({ t: 'result', reqId, ...this.simulation.buildWaterPipes() });
    } else if (value.t === 'buildNetwork') {
      if (
        !('net' in value) ||
        (value.net !== 'power' && value.net !== 'water')
      ) {
        fail('err.notImplemented');
        return;
      }
      if (
        !('points' in value) ||
        !Array.isArray(value.points) ||
        !value.points.every(finitePoint)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...(value.net === 'water'
          ? this.simulation.buildWaterPipes(value.points)
          : this.simulation.buildPowerLine(value.points)),
      });
    } else if (value.t === 'bulldoze') {
      const targets =
        'targets' in value
          ? value.targets
          : 'target' in value
            ? [value.target]
            : undefined;
      if (
        !isBulldozeTargets(targets) ||
        ('targets' in value && 'target' in value)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({ t: 'result', reqId, ...this.simulation.bulldoze(targets) });
    } else if (value.t === 'zone') {
      if (
        !('cells' in value) ||
        !('zone' in value) ||
        !isZonePayload(value.cells, value.zone)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...this.simulation.zone(value.cells, value.zone as ZoneType | null),
      });
    } else if (value.t === 'setIntersection') {
      if (
        !('node' in value) ||
        !Number.isSafeInteger(value.node) ||
        !('control' in value) ||
        !['none', 'lights', 'stop'].includes(String(value.control)) ||
        !('banLeft' in value) ||
        typeof value.banLeft !== 'boolean'
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...this.simulation.setIntersection(
          value.node as number,
          value.control as 'none' | 'lights' | 'stop',
          value.banLeft,
        ),
      });
    } else if (value.t === 'upgradeRoad') {
      if (
        !('segment' in value) ||
        !Number.isSafeInteger(value.segment) ||
        !('type' in value) ||
        typeof value.type !== 'string' ||
        !Object.hasOwn(ROADS, value.type)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...this.simulation.upgradeRoad(
          value.segment as number,
          value.type as RoadTypeId,
        ),
      });
    } else if (value.t === 'buildRoad') {
      if (
        !('type' in value) ||
        typeof value.type !== 'string' ||
        !Object.hasOwn(ROADS, value.type) ||
        !('points' in value) ||
        !isRoadDraft(value.points)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.emit({
        t: 'result',
        reqId,
        ...this.simulation.buildRoad(value.type as RoadTypeId, value.points),
      });
    } else if (value.t === 'setSpeed') {
      if (
        !('speed' in value) ||
        (value.speed !== 0 &&
          value.speed !== 1 &&
          value.speed !== 2 &&
          value.speed !== 4)
      ) {
        fail('err.invalidCommand');
        return;
      }
      this.simulation.setSpeed(value.speed);
      this.emit({ t: 'clock', clock: this.simulation.readClock() });
      this.emit({ t: 'result', reqId, ok: true });
    } else fail('err.notImplemented');
  }

  /** Send one compact clock event after each batch of fixed steps. */
  advance(elapsedMs: number): void {
    if (this.loading) return;
    if (this.simulation?.advance(elapsedMs))
      this.emit({ t: 'clock', clock: this.simulation.readClock() });
    this.streamElapsed += Math.min(elapsedMs, SIM_RUNTIME.maxElapsedMs);
    if (this.simulation && this.streamElapsed >= TRAFFIC_RUNTIME.streamMs) {
      this.streamElapsed %= TRAFFIC_RUNTIME.streamMs;
      if (this.simulation.traffic.count || this.streamedVehicles) {
        const frame = this.simulation.traffic.frame(),
          clock = this.simulation.readClock();
        this.emit({
          t: 'vehicles',
          ...frame,
          tick: clock.ticks,
          speed: clock.speed,
        });
        this.streamedVehicles = frame.count > 0;
      }
    }
  }
}
