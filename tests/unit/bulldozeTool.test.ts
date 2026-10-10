import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimClient, type SimTransport } from '../../src/bridge/simClient';
import type { Command, SimEvent } from '../../src/bridge/protocol';
import { Simulation } from '../../src/sim/simulation';
import { BulldozeTool } from '../../src/tools/bulldozeTool';
import { RoadGraph } from '../../src/world/roadGraph';
import { SIM_RUNTIME } from '../../src/data/simRuntime';

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
function setup() {
  const transport = new Transport(),
    sim = new SimClient(transport as SimTransport);
  const snapshot = new Simulation({
    seed: 1,
    mapId: 'valley',
    cityName: 'Tool',
    mode: 'normal',
  }).snapshot();
  const graph = new RoadGraph();
  for (const z of [0, 40])
    graph.addRoad({
      start: { x: 0, z },
      end: { x: 160, z },
      startHeight: 60,
      endHeight: 60,
      type: 'road_small',
      builtDay: 0,
      paidCost: 400,
    });
  Object.assign(snapshot, graph.snapshot());
  transport.emit({ t: 'ready', reqId: 1, snapshot });
  const preview = vi.fn(),
    tool = new BulldozeTool(
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
describe('demolition gesture safety and authoritative settlement', () => {
  it('mouse hover highlights without deleting; release submits one batch for a fast stroke', async () => {
    const { tool, transport, preview, e, respond } = setup();
    tool.onPointerMove(e(80, 0, 'mouse'));
    expect(tool.readState()).toMatchObject({ selected: 1, refund: 400 });
    expect(preview.mock.calls.at(-1)![0]).toHaveLength(1);
    expect(transport.sent).toHaveLength(0);
    tool.onPointerDown(e(80, -20));
    tool.onPointerMove(e(80, 60));
    expect(tool.readState()).toMatchObject({ selected: 2, refund: 800 });
    expect(transport.sent).toHaveLength(0);
    tool.onPointerUp(e(80, 60));
    tool.onPointerUp(e(80, 60));
    expect(transport.sent).toHaveLength(1);
    expect(tool.readState().pending).toBe(true);
    await respond();
    expect(tool.readState()).toMatchObject({
      selected: 0,
      pending: false,
      removed: 2,
      lastRefund: 800,
    });
  });
  it('multitouch / Escape / deactivation discard the entire stroke', () => {
    const { tool, transport, e } = setup();
    tool.onPointerDown(e());
    tool.onPointerMove(e(80, 40));
    tool.onCancel();
    tool.onPointerUp(e(80, 40));
    expect(transport.sent).toHaveLength(0);
    tool.onPointerDown(e());
    tool.deactivate();
    tool.onPointerUp(e());
    expect(transport.sent).toHaveLength(0);
  });
  it('recomputes an expiring refund from worker clock updates without clearing held targets', async () => {
    const { tool, transport, e, respond } = setup();
    tool.onPointerDown(e());
    transport.emit({
      t: 'clock',
      clock: { day: 7, ticks: 70, tickInDay: 0, speed: 0 },
    });
    expect(tool.readState()).toMatchObject({ selected: 1, refund: 0 });
    tool.onPointerUp(e());
    await respond(false);
    expect(tool.readState().reason).toBe('err.bulldozeMissing');
  });
  it('cancels stale world targets and misses; type filters do not delete a road as a building', () => {
    const { tool, transport, e } = setup();
    tool.onPointerDown(e());
    transport.emit({
      t: 'roadsChanged',
      added: [],
      removed: [3],
      nodes: [],
      removedNodes: [],
    });
    tool.onPointerUp(e());
    expect(transport.sent).toHaveLength(0);
    tool.setKind('building');
    tool.onPointerDown(e());
    tool.onPointerUp(e());
    expect(transport.sent).toHaveLength(0);
    tool.setKind('segment');
    tool.onPointerDown(e(80, 40));
    tool.onPointerUp(e(999, 40));
    expect(transport.sent).toHaveLength(0);
  });
  it('ignores duplicate submissions and does not reactivate a tool on late acknowledgement', async () => {
    const { tool, transport, e, respond } = setup();
    tool.onPointerDown(e());
    tool.onPointerUp(e());
    tool.onPointerDown(e());
    tool.onPointerUp(e());
    expect(transport.sent).toHaveLength(1);
    tool.deactivate();
    await respond();
    expect(tool.readState()).toMatchObject({
      active: false,
      pending: false,
      selected: 0,
    });
  });
  it('does not retry uncertain requests after a timeout', async () => {
    vi.useFakeTimers();
    const { tool, transport, e } = setup();
    tool.onPointerDown(e());
    tool.onPointerUp(e());
    await vi.advanceTimersByTimeAsync(SIM_RUNTIME.requestTimeoutMs);
    expect(tool.readState()).toMatchObject({
      ready: false,
      pending: false,
      reason: 'sim.failed',
    });
    tool.onPointerDown(e());
    tool.onPointerUp(e());
    expect(transport.sent).toHaveLength(1);
  });
});
