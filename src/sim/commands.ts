import type { Response, SimEvent } from '../bridge/protocol';
import type { CitySettings } from '../world/snapshot';
import { Simulation } from './simulation';

const futureCommands = new Set([
  'load',
  'save',
  'buildRoad',
  'upgradeRoad',
  'zone',
  'place',
  'buildNetwork',
  'bulldoze',
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
  constructor(private readonly emit: (event: SimEvent) => void) {}

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
          } as CitySettings,
          this.emit,
        );
        const snapshot = next.snapshot();
        this.simulation = next;
        this.emit({ t: 'ready', reqId, snapshot });
      } catch {
        fail('err.invalidCommand');
      }
      return;
    }
    if (value.t !== 'setSpeed' && !futureCommands.has(value.t)) {
      fail('err.invalidCommand');
      return;
    }
    if (!this.simulation) {
      fail('err.notReady');
      return;
    }
    if (value.t === 'setSpeed') {
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
    if (this.simulation?.advance(elapsedMs))
      this.emit({ t: 'clock', clock: this.simulation.readClock() });
  }
}
