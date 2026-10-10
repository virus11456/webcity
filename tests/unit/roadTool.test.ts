import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimClient, type SimTransport } from '../../src/bridge/simClient';
import type { Command, SimEvent } from '../../src/bridge/protocol';
import { lerp } from '../../src/core/math';
import { Simulation } from '../../src/sim/simulation';
import { RoadTool } from '../../src/tools/roadTool';
import { ToolManager } from '../../src/tools/toolManager';
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
const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((fn) => fn());
  vi.useRealTimers();
});
function setup(money = 70000, roads = false) {
  const transport = new Transport(),
    sim = new SimClient(transport as SimTransport);
  const snapshot = new Simulation({
    seed: 20261006,
    mapId: 'valley',
    cityName: 'Tool',
    mode: 'normal',
  }).snapshot();
  snapshot.terrain.heights.fill(60);
  snapshot.money = snapshot.stats.money = money;
  if (roads) {
    const real = new Simulation(snapshot.settings, undefined, snapshot);
    for (const z of [-80, 80]) {
      const start = { x: -160, z },
        end = { x: 160, z };
      real.buildRoad('gravel', {
        start,
        end,
        c1: lerp(start, end, 1 / 3),
        c2: lerp(start, end, 2 / 3),
        elevated: false,
      });
    }
    Object.assign(snapshot, real.snapshot());
  }
  transport.emit({ t: 'ready', reqId: 1, snapshot });
  const show = vi.fn(),
    changed = vi.fn();
  const tool = new RoadTool(
    {
      sim,
      pick: (x, y) => (x === 999 ? null : { x, z: y }),
      preview: show,
      worldChanged: vi.fn(),
    },
    changed,
  );
  tool.activate();
  disposers.push(() => {
    tool.dispose();
    sim.dispose();
  });
  const tap = (x: number, y: number, kind = 'touch') => {
    const e = { x, y, kind, button: 0 };
    tool.onPointerDown(e);
    tool.onPointerUp(e);
  };
  const respond = async (ok = true) => {
    const command = transport.sent.at(-1)!;
    transport.emit({
      t: 'result',
      reqId: command.reqId,
      ok,
      reason: ok ? undefined : 'err.notEnoughMoney',
      cost: ok ? 200 : undefined,
    });
    await Promise.resolve();
  };
  return { tool, transport, show, changed, tap, respond };
}
describe('road tool interaction state', () => {
  it('touch requires explicit confirmation and locks duplicate submissions until acknowledged', async () => {
    const { tool, tap, transport, respond } = setup();
    tap(-160, -80);
    tap(-80, -80);
    expect(tool.readState().phase).toBe('confirm');
    expect(transport.sent).toHaveLength(0);
    tool.onConfirm();
    tool.onConfirm();
    tap(0, -80);
    expect(transport.sent).toHaveLength(1);
    expect(tool.readState().pending).toBe(true);
    await respond();
    expect(tool.readState()).toMatchObject({
      pending: false,
      phase: 'end',
      preview: null,
    });
    tap(0, -80);
    tool.onConfirm();
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[1]).toMatchObject({
      points: { start: { x: -80, z: -80 }, end: { x: 0, z: -80 } },
    });
    await respond();
  });
  it('mouse hover previews and second click commits', async () => {
    const { tool, tap, transport, respond } = setup();
    tap(-160, -80, 'mouse');
    tool.onPointerMove({ x: -80, y: -80, kind: 'mouse', button: 0 });
    expect(tool.readState().preview?.preview?.cost).toBe(200);
    tap(-80, -80, 'mouse');
    expect(transport.sent).toHaveLength(1);
    await respond();
  });
  it('cancels a drag, multi-touch or Escape without sending a road', () => {
    const { tool, tap, transport } = setup();
    tap(-160, -80);
    tool.onPointerDown({ x: -80, y: -80, kind: 'touch', button: 0 });
    tool.onPointerMove({ x: -70, y: -80, kind: 'touch', button: 0 });
    tool.onPointerUp({ x: -70, y: -80, kind: 'touch', button: 0 });
    expect(tool.readState().preview).toBeNull();
    tool.onCancel();
    tool.onPointerUp({ x: -70, y: -80, kind: 'touch', button: 0 });
    tool.onConfirm();
    expect(tool.readState().phase).toBe('start');
    expect(transport.sent).toHaveLength(0);
  });
  it('does not resurrect a canceled or deactivated draft when a reply arrives', async () => {
    const { tool, tap, respond } = setup();
    tap(-160, -80);
    tap(-80, -80);
    tool.onConfirm();
    tool.deactivate();
    await respond();
    expect(tool.readState()).toMatchObject({
      active: false,
      phase: 'start',
      preview: null,
      pending: false,
    });
    tool.activate();
    expect(tool.readState().phase).toBe('start');
  });
  it('shows worker rejection, preserves draft and does not advance the start', async () => {
    const { tool, tap, respond } = setup();
    tap(-160, -80);
    tap(-80, -80);
    tool.onConfirm();
    await respond(false);
    expect(tool.readState()).toMatchObject({
      reason: 'err.notEnoughMoney',
      phase: 'confirm',
      pending: false,
    });
    expect(tool.readState().preview!.preview!.draft.start).toEqual({
      x: -160,
      z: -80,
    });
  });
  it('disables an uncertain request after timeout instead of automatically retrying', async () => {
    vi.useFakeTimers();
    const { tool, tap, transport } = setup();
    tap(-160, -80);
    tap(-80, -80);
    tool.onConfirm();
    await vi.advanceTimersByTimeAsync(SIM_RUNTIME.requestTimeoutMs);
    expect(tool.readState()).toMatchObject({
      ready: false,
      pending: false,
      reason: 'sim.failed',
    });
    tool.onConfirm();
    expect(transport.sent).toHaveLength(1);
  });
  it('blocks locally invalid or unaffordable drafts and does not lose the active type', () => {
    const { tool, tap, transport } = setup(10);
    tool.setType('gravel');
    tap(-160, -80);
    tap(-80, -80);
    tool.onConfirm();
    expect(tool.readState().preview?.reason).toBe('err.notEnoughMoney');
    expect(transport.sent).toHaveLength(0);
    tool.onCancel();
    expect(tool.readState().type).toBe('gravel');
  });
  it('temporarily disables angle snapping with Shift and ignores terrain misses', () => {
    const { tool, tap } = setup();
    tap(999, 0);
    expect(tool.readState().phase).toBe('start');
    tap(-160, -80);
    tap(-80, -69);
    const snapped = tool.readState().preview!.preview!.draft.end;
    tool.onAngleModifier(true);
    const free = tool.readState().preview!.preview!.draft.end;
    expect(free).not.toEqual(snapped);
    tool.onAngleModifier(false);
    expect(tool.readState().preview!.preview!.draft.end).toEqual(snapped);
  });
  it('returns to exploration through the single-tool manager', () => {
    const { tool, tap } = setup();
    tool.deactivate();
    const connect = vi.fn(),
      manager = new ToolManager(connect);
    manager.select(tool);
    tap(-160, -80);
    manager.select(tool);
    expect(tool.readState().phase).toBe('end');
    manager.select(null);
    expect(tool.readState().active).toBe(false);
    expect(connect).toHaveBeenLastCalledWith(null);
    manager.dispose();
  });
});

describe('curved and free tool input', () => {
  it('uses three points, confirms touch and keeps a continuous curve chain', async () => {
    const { tool, tap, transport, respond } = setup();
    tool.setMode('curve');
    tool.setAngleSnap(false);
    tap(-160, -80);
    expect(tool.readState().phase).toBe('control');
    tap(-160, 80);
    expect(tool.readState().phase).toBe('end');
    tap(80, 80);
    expect(tool.readState().preview?.canBuild).toBe(true);
    expect(transport.sent).toHaveLength(0);
    tool.onConfirm();
    expect(transport.sent[0]).toMatchObject({
      t: 'buildRoad',
      points: { start: { x: -160, z: -80 }, end: { x: 80, z: 80 } },
    });
    await respond();
    expect(tool.readState().phase).toBe('control');
  });
  it('draws a smooth free stroke, with touch confirmation and cancellation', () => {
    const { tool, transport } = setup();
    tool.setMode('free');
    const e = (x: number, y: number) => ({ x, y, button: 0, kind: 'touch' });
    tool.onPointerDown(e(-160, -80));
    tool.onPointerMove(e(-160, -40));
    tool.onPointerMove(e(-120, 0));
    tool.onPointerMove(e(-80, 0));
    tool.onPointerUp(e(-80, 0));
    const d = tool.readState().preview?.preview?.draft;
    expect(d?.c1.x).toBe(-160);
    expect(d?.c2.z).toBe(0);
    expect(tool.readState().preview?.canBuild).toBe(true);
    expect(transport.sent).toHaveLength(0);
    tool.onCancel();
    tool.onConfirm();
    expect(transport.sent).toHaveLength(0);
    expect(tool.readState().phase).toBe('start');
  });
});

describe('road upgrade gestures', () => {
  it('touch waits for confirmation and cancellation sends nothing', async () => {
    const { tool, tap, transport, respond } = setup(70000, true);
    tool.setMode('upgrade');
    tap(0, -80);
    expect(tool.readState().upgradeCount).toBe(1);
    expect(tool.readState().preview?.preview?.cost).toBe(480);
    expect(transport.sent).toHaveLength(0);
    tool.onCancel();
    tool.onConfirm();
    expect(transport.sent).toHaveLength(0);
    tap(0, -80);
    tool.onConfirm();
    expect(transport.sent[0]!.t).toBe('upgradeRoad');
    await respond();
    expect(tool.readState().pending).toBe(false);
  });
  it('clears hover selection on down and submits each dragged road only once', async () => {
    const { tool, transport, respond } = setup(70000, true);
    tool.setMode('upgrade');
    tool.onPointerMove({ x: 0, y: -80, kind: 'mouse', button: 0 });
    tool.onPointerDown({ x: 0, y: 80, kind: 'mouse', button: 0 });
    expect(tool.readState().upgradeCount).toBe(1);
    for (const y of [80, -80, -80, 80])
      tool.onPointerMove({ x: 0, y, kind: 'mouse', button: 0 });
    expect(tool.readState().upgradeCount).toBe(2);
    tool.onPointerUp({ x: 0, y: 80, kind: 'mouse', button: 0 });
    expect(transport.sent).toHaveLength(1);
    await respond();
    expect(transport.sent).toHaveLength(2);
    await respond();
    expect(tool.readState().pending).toBe(false);
  });
});
describe('road elevation controls', () => {
  it('keeps the first height while changing the far end and carries the built endpoint forward', async () => {
    const { tool, tap, transport, respond } = setup();
    tool.setElevation(6);
    tap(-160, -80);
    tool.setElevation(12);
    tap(-80, -80);
    expect(tool.readState().preview?.preview?.cost).toBe(600);
    tool.onConfirm();
    expect(transport.sent[0]).toMatchObject({
      t: 'buildRoad',
      points: { elevated: true, startHeight: 66, endHeight: 72 },
    });
    await respond();
    tool.setElevation(6);
    tap(0, -80);
    tool.onConfirm();
    expect(transport.sent[1]).toMatchObject({
      t: 'buildRoad',
      points: { elevated: true, startHeight: 72, endHeight: 66 },
    });
    await respond();
    tool.onCancel();
    tool.setElevation(100);
    expect(tool.readState().elevation).toBe(30);
    tool.setElevation(-5);
    expect(tool.readState().elevation).toBe(0);
  });
});
