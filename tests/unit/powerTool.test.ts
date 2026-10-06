import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimClient, type SimTransport } from '../../src/bridge/simClient';
import type { Command, SimEvent } from '../../src/bridge/protocol';
import { Simulation } from '../../src/sim/simulation';
import { PlaceTool } from '../../src/tools/placeTool';
import { NetworkTool } from '../../src/tools/networkTool';

class Transport {
  sent: Command[] = [];
  listeners = new Map<string, Set<(event: never) => void>>();
  postMessage(command: Command) {
    this.sent.push(command);
  }
  addEventListener(type: string, fn: (event: never) => void) {
    const s = this.listeners.get(type) ?? new Set();
    s.add(fn);
    this.listeners.set(type, s);
  }
  removeEventListener(type: string, fn: (event: never) => void) {
    this.listeners.get(type)?.delete(fn);
  }
  terminate() {}
  emit(data: SimEvent) {
    for (const fn of this.listeners.get('message') ?? []) fn({ data } as never);
  }
}
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
  vi.useRealTimers();
});
function setup(line = false) {
  const transport = new Transport(),
    sim = new SimClient(transport as SimTransport);
  const snapshot = new Simulation({
    seed: 1,
    mapId: 'valley',
    cityName: 'Tool',
    mode: 'normal',
  }).snapshot();
  snapshot.terrain.heights.fill(60);
  transport.emit({ t: 'ready', reqId: 1, snapshot });
  const preview = vi.fn(),
    tool = new (line ? NetworkTool : PlaceTool)(
      { sim, pick: (x, y) => (x === 999 ? null : { x, z: y }), preview },
      vi.fn(),
    );
  tool.activate();
  cleanups.push(() => {
    tool.dispose();
    sim.dispose();
  });
  const e = (x = 80, y = 0, kind = 'touch') => ({ x, y, kind, button: 0 });
  const respond = async (ok = true) => {
    transport.emit({
      t: 'result',
      reqId: transport.sent.at(-1)!.reqId,
      ok,
      refund: ok ? 800 : undefined,
      reason: ok ? undefined : 'err.bulldozeMissing',
    });
    await Promise.resolve();
  };
  return { tool, transport, preview, e, respond };
}
describe('power confirmation and cancellation', () => {
  it('touch previews and rotates without spending; confirm sends once until acknowledged', async () => {
    const { tool, transport, e, respond } = setup();
    tool.onPointerDown(e());
    tool.onPointerUp(e());
    expect(tool.readState().preview?.valid).toBe(true);
    expect(transport.sent).toHaveLength(0);
    tool.rotate();
    expect(tool.readState().rotation).toBe(Math.PI / 2);
    tool.onConfirm();
    tool.onConfirm();
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      t: 'place',
      rotation: Math.PI / 2,
    });
    await respond();
    expect(tool.readState().pending).toBe(false);
    expect(tool.readState().preview).toBeNull();
  });
  it('multitouch cancellation discards drafts without a command', () => {
    const { tool, transport, e } = setup();
    tool.onPointerDown(e());
    tool.onCancel();
    tool.onPointerUp(e());
    tool.onConfirm();
    expect(transport.sent).toHaveLength(0);
  });
  it('needs two line points, supports cancel and reports worker rejection', async () => {
    const { tool, transport, e, respond } = setup(true);
    tool.onPointerDown(e(0));
    tool.onPointerUp(e(0));
    tool.onConfirm();
    expect(transport.sent).toHaveLength(0);
    tool.onPointerDown(e(80));
    tool.onPointerUp(e(80));
    expect(tool.readState().preview?.cost).toBe(100);
    tool.onConfirm();
    expect(transport.sent[0]).toMatchObject({
      t: 'buildNetwork',
      net: 'power',
    });
    await respond(false);
    expect(tool.readState().reason).toBe('err.bulldozeMissing');
    tool.onCancel();
    expect(tool.readState().preview).toBeNull();
  });
  it('does not publish a command when the preview is invalid or deactivated', () => {
    const { tool, transport, e } = setup();
    tool.onPointerDown(e(2000));
    tool.onPointerUp(e(2000));
    tool.onConfirm();
    expect(transport.sent).toHaveLength(0);
    tool.deactivate();
    tool.onConfirm();
    expect(transport.sent).toHaveLength(0);
  });
});
