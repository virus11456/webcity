import { afterEach, it, expect, vi } from 'vitest';
import { SimClient, type SimTransport } from '../../src/bridge/simClient';
import type { Command, SimEvent } from '../../src/bridge/protocol';
import { Simulation } from '../../src/sim/simulation';
import { WaterTool } from '../../src/tools/waterTool';
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
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
});
function setup() {
  const transport = new Transport(),
    sim = new SimClient(transport as SimTransport),
    world = new Simulation({
      seed: 72,
      mapId: 'valley',
      cityName: 'Tool',
      mode: 'normal',
    });
  world.buildRoad('road_small', {
    start: { x: -160, z: -80 },
    c1: { x: -130, z: -80 },
    c2: { x: -110, z: -80 },
    end: { x: -80, z: -80 },
    elevated: false,
  });
  const snapshot = world.snapshot();
  snapshot.terrain.heights.fill(60);
  snapshot.networks.water = [
    {
      id: 900,
      points: [
        { x: 0, z: 0 },
        { x: 80, z: 0 },
      ],
    },
  ];
  transport.emit({ t: 'ready', reqId: 1, snapshot });
  const preview = vi.fn(),
    tool = new WaterTool(
      { sim, pick: (x, y) => ({ x, z: y }), preview },
      vi.fn(),
    );
  tool.activate();
  cleanups.push(() => {
    tool.dispose();
    sim.dispose();
  });
  const e = (x = 80, y = 80) => ({ x, y, kind: 'touch', button: 0 });
  const tap = (x = 80, y = 80) => {
    tool.onPointerDown(e(x, y));
    tool.onPointerUp(e(x, y));
  };
  const respond = async (ok = true) => {
    transport.emit({
      t: 'result',
      reqId: transport.sent.at(-1)!.reqId,
      ok,
      reason: ok ? undefined : 'err.notEnoughMoney',
    });
    await Promise.resolve();
  };
  return { tool, transport, preview, tap, e, respond };
}
it('rotates a water facility and sends only one command after confirmation', async () => {
  const { tool, transport, tap, respond } = setup();
  tap();
  expect(tool.readState().preview?.valid).toBe(true);
  expect(transport.sent).toHaveLength(0);
  tool.rotate();
  tool.onConfirm();
  tool.onConfirm();
  expect(transport.sent).toHaveLength(1);
  expect(transport.sent[0]).toMatchObject({
    t: 'place',
    defId: 'water_tower',
    rotation: Math.PI / 2,
  });
  await respond();
  expect(tool.readState().pending).toBe(false);
  expect(tool.readState().preview).toBeNull();
});
it('snaps a two-tap pipe to an existing network and reports worker rejection', async () => {
  const { tool, transport, tap, respond } = setup();
  tool.setMode('pipe');
  tap(40, 6);
  tool.onConfirm();
  expect(transport.sent).toHaveLength(0);
  tap(40, 80);
  tool.onConfirm();
  expect(transport.sent[0]).toMatchObject({
    t: 'buildNetwork',
    net: 'water',
    points: [
      { x: 40, z: 0 },
      { x: 40, z: 80 },
    ],
  });
  await respond(false);
  expect(tool.readState().reason).toBe('err.notEnoughMoney');
});
it('auto-road mode previews cost, requires confirmation and cancels without spending', () => {
  const { tool, transport } = setup();
  tool.setMode('roads');
  expect(tool.readState().preview).toMatchObject({ valid: true, cost: 100 });
  expect(transport.sent).toHaveLength(0);
  tool.onCancel();
  expect(tool.readState().mode).toBe('pipe');
  tool.onConfirm();
  expect(transport.sent).toHaveLength(0);
  tool.setMode('roads');
  tool.onConfirm();
  expect(transport.sent[0]).toMatchObject({ t: 'buildRoadPipes' });
});
it('camera cancellation, invalid shore placement and deactivation cannot submit', () => {
  const { tool, transport, e, tap } = setup();
  tool.onPointerDown(e());
  tool.onCancel();
  tool.onPointerUp(e());
  tool.onConfirm();
  expect(transport.sent).toHaveLength(0);
  tool.setMode('water_pump');
  tap();
  expect(tool.readState().preview?.reason).toBe('err.waterShore');
  tool.onConfirm();
  expect(transport.sent).toHaveLength(0);
  tool.setMode('water_tower');
  tap();
  tool.deactivate();
  tool.onConfirm();
  expect(transport.sent).toHaveLength(0);
});
it('revalidates the total auto-road cost when funds change before confirmation', () => {
  const { tool, transport } = setup();
  tool.setMode('roads');
  transport.emit({ t: 'fundsChanged', money: 50 });
  expect(tool.readState().preview?.reason).toBe('err.notEnoughMoney');
  tool.onConfirm();
  expect(transport.sent).toHaveLength(0);
});
