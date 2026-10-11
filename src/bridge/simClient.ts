import { SIM_RUNTIME } from '../data/simRuntime';
import { WorldMirror } from './mirror';
import type { Command, CommandInput, Response, SimEvent } from './protocol';

export interface SimTransport {
  postMessage(command: Command): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SimEvent>) => void,
  ): void;
  addEventListener(
    type: 'error' | 'messageerror',
    listener: (event: Event) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<SimEvent>) => void,
  ): void;
  removeEventListener(
    type: 'error' | 'messageerror',
    listener: (event: Event) => void,
  ): void;
  terminate(): void;
}
interface Pending {
  resolve: (response: Response) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Request correlation, mirror updates and lifecycle for an injected worker. */
export class SimClient {
  readonly mirror = new WorldMirror();
  private nextRequest = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(event: SimEvent) => void>();
  private stopped = false;

  constructor(
    private readonly worker: SimTransport,
    private readonly tileLimit: 4 | 9 = 9,
  ) {
    worker.addEventListener('message', this.receive);
    worker.addEventListener('error', this.failed);
    worker.addEventListener('messageerror', this.failed);
  }

  /** Send a command; game validation failures resolve as a result, transport failures reject. */
  send(command: CommandInput): Promise<Response> {
    if (this.stopped)
      return Promise.reject(new Error('Simulation client is closed'));
    const reqId = this.nextRequest++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error('Simulation request timed out'));
      }, SIM_RUNTIME.requestTimeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
      try {
        this.worker.postMessage({
          ...command,
          ...(['init', 'load'].includes(command.t)
            ? { tileLimit: this.tileLimit }
            : {}),
          reqId,
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(reqId);
        reject(
          error instanceof Error
            ? error
            : new Error('Simulation transport failed'),
        );
      }
    });
  }

  /** Subscribe after mirror updates; unsubscribe is idempotent. */
  onEvent(listener: (event: SimEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private receive = ({ data: event }: MessageEvent<SimEvent>): void => {
    if (this.stopped) return;
    this.mirror.apply(event);
    if ('reqId' in event) {
      const request = this.pending.get(event.reqId);
      if (request) {
        this.pending.delete(event.reqId);
        clearTimeout(request.timer);
        request.resolve(event);
      }
    }
    for (const listener of this.listeners) listener(event);
  };
  private failed = (): void => {
    // Notify before disposal so controls never remain apparently running after a crash.
    try {
      for (const listener of this.listeners)
        listener({ t: 'error', message: 'sim.failed' });
    } finally {
      this.dispose();
    }
  };

  /** Terminate the worker and reject outstanding requests; safe to call repeatedly. */
  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.worker.removeEventListener('message', this.receive);
    this.worker.removeEventListener('error', this.failed);
    this.worker.removeEventListener('messageerror', this.failed);
    this.worker.terminate();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Simulation client closed'));
    }
    this.pending.clear();
    this.listeners.clear();
  }
}
