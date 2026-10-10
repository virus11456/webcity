import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimClient, type SimTransport } from '../../src/bridge/simClient';
import type { Command, SimEvent } from '../../src/bridge/protocol';
import { SIM_RUNTIME } from '../../src/data/simRuntime';

class FakeWorker {
  sent: Command[] = [];
  terminated = false;
  listeners = new Map<string, Set<(event: never) => void>>();
  postMessage(command: Command) {
    this.sent.push(command);
  }
  addEventListener(type: string, callback: (event: never) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, callback: (event: never) => void) {
    this.listeners.get(type)?.delete(callback);
  }
  terminate() {
    this.terminated = true;
  }
  message(data: SimEvent) {
    for (const listener of this.listeners.get('message') ?? [])
      listener({ data } as never);
  }
  crash() {
    for (const listener of this.listeners.get('error') ?? [])
      listener({} as never);
  }
}
const setup = () => {
  const worker = new FakeWorker();
  return { worker, client: new SimClient(worker as SimTransport) };
};
afterEach(() => vi.useRealTimers());
describe('sim client transport', () => {
  it('correlates overlapping commands even when results arrive out of order', async () => {
    const { worker, client } = setup();
    const first = client.send({ t: 'setSpeed', speed: 0 });
    const second = client.send({ t: 'setSpeed', speed: 4 });
    worker.message({ t: 'result', reqId: worker.sent[1]!.reqId, ok: true });
    worker.message({
      t: 'result',
      reqId: worker.sent[0]!.reqId,
      ok: false,
      reason: 'err.notReady',
    });
    await expect(second).resolves.toMatchObject({ ok: true, reqId: 2 });
    await expect(first).resolves.toMatchObject({ ok: false, reqId: 1 });
    client.dispose();
  });
  it('supports unsubscribe and does not consume later results as pending replies', async () => {
    const { worker, client } = setup();
    const listener = vi.fn();
    const off = client.onEvent(listener);
    worker.message({ t: 'result', reqId: 999, ok: true });
    expect(listener).toHaveBeenCalledOnce();
    off();
    off();
    const result = client.send({ t: 'save' });
    worker.message({
      t: 'result',
      reqId: 1,
      ok: false,
      reason: 'err.notImplemented',
    });
    await expect(result).resolves.toMatchObject({ ok: false });
    expect(listener).toHaveBeenCalledOnce();
    client.dispose();
  });
  it('times out missing replies, and disposes pending requests and listeners', async () => {
    vi.useFakeTimers();
    const { worker, client } = setup();
    const first = client.send({ t: 'save' });
    const assertion = expect(first).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(SIM_RUNTIME.requestTimeoutMs);
    await assertion;
    const second = client.send({ t: 'save' });
    const closed = expect(second).rejects.toThrow('closed');
    client.dispose();
    client.dispose();
    await closed;
    await expect(client.send({ t: 'save' })).rejects.toThrow('closed');
    expect(worker.terminated).toBe(true);
    expect([...worker.listeners.values()].every((set) => set.size === 0)).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it('surfaces a worker crash and rejects outstanding commands', async () => {
    const { worker, client } = setup();
    const listener = vi.fn();
    client.onEvent(listener);
    const result = client.send({ t: 'save' });
    const assertion = expect(result).rejects.toThrow('closed');
    worker.crash();
    await assertion;
    expect(listener).toHaveBeenCalledWith({
      t: 'error',
      message: 'sim.failed',
    });
    expect(worker.terminated).toBe(true);
  });
  it('rejects synchronous postMessage failures without leaking timers', async () => {
    vi.useFakeTimers();
    const { worker, client } = setup();
    worker.postMessage = () => {
      throw new Error('clone failed');
    };
    await expect(client.send({ t: 'save' })).rejects.toThrow('clone failed');
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
  });
});
