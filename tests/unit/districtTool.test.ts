import { it, expect } from 'vitest';
import { DistrictTool } from '../../src/tools/districtTool';
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
it('commits a stroke only on release and cancels it entirely when a second finger takes over', () => {
  const transport = new Transport(),
    sim = new SimClient(transport as SimTransport),
    s = busState();
  s.districts = [{ id: s.nextId++, name: 'A', cells: [] }];
  transport.emit({ t: 'ready', reqId: 1, snapshot: s });
  const tool = new DistrictTool(
    sim,
    (x, y) => ({ x, z: y }),
    () => {},
  );
  tool.activate();
  const p = { x: 0, y: 0, kind: 'touch', button: 0 };
  tool.onPointerDown(p);
  tool.onPointerMove({ ...p, x: 100 });
  expect(transport.sent).toHaveLength(0);
  tool.onCancel();
  tool.onPointerUp(p);
  expect(tool.readState().points).toHaveLength(0);
  expect(transport.sent).toHaveLength(0);
  tool.onPointerDown(p);
  tool.onPointerUp({ ...p, x: 100 });
  expect(transport.sent[0]).toMatchObject({
    t: 'district',
    action: 'paint',
    id: s.districts[0]!.id,
    points: [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
    ],
  });
  const c = transport.sent[0]!;
  transport.emit({ t: 'result', reqId: c.reqId, ok: true });
  tool.dispose();
  sim.dispose();
});
