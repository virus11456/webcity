import { it, expect } from 'vitest';
import { BusTool } from '../../src/tools/busTool';
import { SimClient, type SimTransport } from '../../src/bridge/simClient';
import { busState } from '../fixtures/busCity';
import type { Command, SimEvent } from '../../src/bridge/protocol';
class Transport {
  sent: Command[] = [];
  listeners = new Map<string, Set<(e: never) => void>>();
  postMessage(c: Command) {
    this.sent.push(c);
  }
  addEventListener(t: string, f: (e: never) => void) {
    const s = this.listeners.get(t) ?? new Set();
    s.add(f);
    this.listeners.set(t, s);
  }
  removeEventListener(t: string, f: (e: never) => void) {
    this.listeners.get(t)?.delete(f);
  }
  terminate() {}
  emit(data: SimEvent) {
    for (const f of this.listeners.get('message') ?? []) f({ data } as never);
  }
}
it('keeps drafted stops on a multi-touch cancellation and sends no accidental line command', () => {
  const transport = new Transport(),
    sim = new SimClient(transport as SimTransport);
  transport.emit({ t: 'ready', reqId: 1, snapshot: busState() });
  const tool = new BusTool(
    sim,
    (x, y) => ({ x, z: y }),
    () => {},
  );
  tool.activate();
  const first = { x: -180, y: -115, kind: 'touch', button: 0 };
  tool.onPointerDown(first);
  tool.onPointerUp(first);
  expect(tool.readState().stops).toHaveLength(1);
  const second = { ...first, x: 180 };
  tool.onPointerDown(second);
  tool.onCancel();
  tool.onPointerUp(second);
  expect(tool.readState().stops).toHaveLength(1);
  expect(transport.sent).toHaveLength(0);
  tool.clearDraft();
  expect(tool.readState().stops).toHaveLength(0);
  tool.dispose();
  sim.dispose();
});
