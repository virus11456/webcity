import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimClient, type SimTransport } from '../../src/bridge/simClient';
import type { Command, SimEvent } from '../../src/bridge/protocol';
import { Simulation } from '../../src/sim/simulation';
import { ZoneTool } from '../../src/tools/zoneTool';
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
  snapshot.zoneBlocks = [
    {
      id: 4,
      segment: 3,
      side: 1,
      origin: { x: 4, z: 8 },
      dir: { x: 1, z: 0 },
      width: 8,
      cells: new Uint8Array(32),
      buildingAt: new Int32Array(32).fill(-1),
    },
  ];
  snapshot.segments = [
    {
      id: 3,
      type: 'road_small',
      start: 1,
      end: 2,
      c1: { x: 20, z: 0 },
      c2: { x: 40, z: 0 },
      length: 64,
      elevated: false,
      builtDay: 0,
      zoneBlockIds: [4],
    },
  ];
  transport.emit({ t: 'ready', reqId: 1, snapshot });
  const preview = vi.fn();
  const tool = new ZoneTool(
    {
      sim,
      pick: (x, y) => (x === 999 ? null : { x, z: y }),
      preview,
      worldChanged: vi.fn(),
    },
    vi.fn(),
  );
  tool.activate();
  cleanups.push(() => {
    tool.dispose();
    sim.dispose();
  });
  const e = (x = 4, y = 12) => ({ x, y, kind: 'touch', button: 0 });
  const respond = async (ok = true) => {
    transport.emit({
      t: 'result',
      reqId: transport.sent.at(-1)!.reqId,
      ok,
      reason: ok ? undefined : 'err.zoneCell',
    });
    await Promise.resolve();
  };
  return { tool, transport, preview, e, respond };
}
describe('zone tool gesture transactions', () => {
  it('previews a continuous brush, submits once on release and locks duplicate input', async () => {
    const { tool, transport, e, respond } = setup();
    tool.setMode('small');
    tool.onPointerDown(e());
    tool.onPointerMove(e(60, 12));
    expect(tool.readState().selected).toBeGreaterThanOrEqual(8);
    expect(transport.sent).toHaveLength(0);
    tool.onPointerUp(e(60, 12));
    tool.onPointerUp(e(60, 12));
    tool.onPointerDown(e());
    expect(transport.sent).toHaveLength(1);
    expect(tool.readState().pending).toBe(true);
    expect(transport.sent[0]).toMatchObject({ t: 'zone', zone: 'RL' });
    await respond();
    expect(tool.readState()).toMatchObject({ pending: false, selected: 0 });
  });
  it('multitouch, Escape and deactivation discard the entire stroke before submission', () => {
    const { tool, transport, e } = setup();
    tool.setMode('large');
    tool.onPointerDown(e());
    tool.onPointerMove(e(60, 12));
    tool.onCancel();
    tool.onPointerUp(e(60, 12));
    expect(transport.sent).toHaveLength(0);
    expect(tool.readState().selected).toBe(0);
    tool.onPointerDown(e());
    tool.deactivate();
    tool.onPointerUp(e());
    expect(transport.sent).toHaveLength(0);
  });
  it('does not permit choosing locked types, handles terrain misses and supports erase', async () => {
    const { tool, transport, e, respond } = setup();
    tool.setZone('O');
    expect(tool.readState().zone).toBe('RL');
    tool.onPointerDown(e(999, 0));
    tool.onPointerUp(e(999, 0));
    expect(transport.sent).toHaveLength(0);
    tool.setZone(null);
    tool.setMode('rectangle');
    tool.onPointerDown(e(0, 8));
    tool.onPointerUp(e(16, 24));
    expect(transport.sent[0]).toMatchObject({
      t: 'zone',
      zone: null,
      cells: [
        [4, 0],
        [4, 1],
        [4, 8],
        [4, 9],
      ],
    });
    await respond();
  });
  it('shows worker rejection without optimistically changing cells; late replies cannot reactivate tools', async () => {
    const { tool, transport, e, respond } = setup();
    tool.onPointerDown(e());
    tool.onPointerUp(e());
    await respond(false);
    expect(tool.readState().reason).toBe('err.zoneCell');
    tool.onCancel();
    tool.onPointerDown(e());
    tool.onPointerUp(e());
    tool.deactivate();
    await respond();
    expect(tool.readState()).toMatchObject({
      active: false,
      pending: false,
      selected: 0,
    });
    expect(transport.sent).toHaveLength(2);
  });
  it('cancels held selections when road changes replace zone IDs', () => {
    const { tool, transport, e } = setup();
    tool.onPointerDown(e());
    transport.emit({ t: 'zonesChanged', blocks: [], removed: [4] });
    tool.onPointerUp(e());
    expect(transport.sent).toHaveLength(0);
    expect(tool.readState().selected).toBe(0);
  });
  it('disables uncertain timeout operations instead of resending the paint', async () => {
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
