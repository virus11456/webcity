import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { SimClient, type SimTransport } from '../../src/bridge/simClient';
import type { Command, SimEvent } from '../../src/bridge/protocol';
import { createTopBarModel } from '../../src/ui/hud/topBarModel';

class WorkerStub {
  sent: Command[] = [];
  listeners = new Map<string, Set<(event: never) => void>>();
  postMessage(command: Command) {
    this.sent.push(command);
  }
  addEventListener(type: string, listener: (event: never) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: (event: never) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  terminate() {}
  emit(data: SimEvent) {
    for (const listener of this.listeners.get('message') ?? [])
      listener({ data } as never);
  }
}
const snapshot = new Simulation({
  seed: 42,
  mapId: 'valley',
  mode: 'normal',
  cityName: 'HUD test city',
}).snapshot();
function setup() {
  const worker = new WorkerStub();
  const client = new SimClient(worker as SimTransport);
  const model = createTopBarModel(client);
  worker.emit({ t: 'ready', reqId: 0, snapshot });
  return {
    worker,
    client,
    model,
    dispose: () => {
      model.dispose();
      client.dispose();
    },
  };
}
describe('worker-fed top bar', () => {
  it('shows city identity and initial stats, then updates money immediately without a daily event', () => {
    const { worker, model, client, dispose } = setup();
    expect(model.cityName.value).toBe('HUD test city');
    expect(client.mirror.cityName).toBe('HUD test city');
    expect(model.stats.value?.money).toBe(70000);
    worker.emit({ t: 'fundsChanged', money: -123.45 });
    expect(model.stats.value?.money).toBe(-123.45);
    const next = {
      ...snapshot.stats,
      day: 1,
      money: -95,
      population: 80,
      income: 60,
      expenses: 31,
      demand: { R: 12, C: 24, I: 36, O: 48 },
      happiness: 72,
    };
    worker.emit({ t: 'stats', stats: next });
    expect(model.stats.value).toEqual(next);
    next.population = 999;
    expect(model.stats.value?.population).toBe(80);
    dispose();
  });
  it('does not copy stats on clock ticks and displays speed only after acknowledgement', async () => {
    const { worker, model, client, dispose } = setup();
    const read = vi.spyOn(client.mirror, 'readStats');
    const original = model.stats.value;
    const pending = model.setSpeed(4);
    expect(worker.sent.at(-1)?.t).toBe('setSpeed');
    expect(model.clock.value?.speed).toBe(1);
    worker.emit({
      t: 'clock',
      clock: { day: 0, ticks: 4, tickInDay: 4, speed: 4 },
    });
    worker.emit({ t: 'result', reqId: worker.sent.at(-1)!.reqId, ok: true });
    await pending;
    expect(model.clock.value?.speed).toBe(4);
    expect(model.stats.value).toBe(original);
    expect(read).not.toHaveBeenCalled();
    dispose();
  });
  it('locks failed or bankrupt simulations and ignores updates after disposal', async () => {
    const { worker, model, client, dispose } = setup();
    worker.emit({ t: 'error', message: 'sim.failed' });
    await model.setSpeed(2);
    expect(worker.sent).toHaveLength(0);
    expect(model.failed.value).toBe(true);
    worker.emit({ t: 'ready', reqId: 0, snapshot });
    expect(model.failed.value).toBe(false);
    const finance = client.mirror.readFinance()!;
    finance.economy.status = 'gameOver';
    worker.emit({ t: 'economy', finance });
    await model.setSpeed(4);
    expect(model.gameOver.value).toBe(true);
    expect(worker.sent).toHaveLength(0);
    model.dispose();
    const original = model.stats.value;
    worker.emit({ t: 'fundsChanged', money: 1 });
    expect(model.stats.value).toBe(original);
    dispose();
  });
  it('marks a rejected speed command as failed without changing the displayed speed', async () => {
    const { worker, model, dispose } = setup();
    const pending = model.setSpeed(4);
    worker.emit({
      t: 'result',
      reqId: worker.sent.at(-1)!.reqId,
      ok: false,
      reason: 'err.gameOver',
    });
    await pending;
    expect(model.failed.value).toBe(true);
    expect(model.clock.value?.speed).toBe(1);
    dispose();
  });
});
