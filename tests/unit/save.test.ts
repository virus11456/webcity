import { deepStrictEqual } from 'node:assert/strict';
import { describe, expect, it, vi } from 'vitest';
import { serialize, deserialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import { MAP_PRESETS } from '../../src/data/terrain';
import type { SimEvent } from '../../src/bridge/protocol';
const settings = {
  seed: MAP_PRESETS[0].seed,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Saved city',
};
describe('versioned city saves', () => {
  it('preserves typed arrays, settings and live assets with byte-identical round trips', async () => {
    const sim = new Simulation(settings);
    expect(sim.place('power_wind', { x: -80, z: -220 }, 0).ok).toBe(true);
    sim.finance({ t: 'takeLoan', bank: 0 });
    sim.finance({ t: 'setTax', zone: 'RL', rate: 0.15 });
    for (let i = 0; i < 35; i++) sim.tick();
    const first = await serialize(sim.snapshot()),
      snapshot = await deserialize(first);
    expect(snapshot.terrain.heights).toBeInstanceOf(Float32Array);
    expect(snapshot.terrain.resources.fertile).toBeInstanceOf(Uint8Array);
    expect(snapshot.buildings[0]!.defId).toBe('power_wind');
    expect(snapshot.taxRates.RL).toBe(0.15);
    expect(snapshot.loans).toHaveLength(1);
    const restored = new Simulation(snapshot.settings, () => {}, snapshot);
    const second = await serialize(restored.snapshot());
    deepStrictEqual(new Uint8Array(first), new Uint8Array(second));
    sim.tick();
    restored.tick();
    deepStrictEqual(
      new Uint8Array(await serialize(sim.snapshot())),
      new Uint8Array(await serialize(restored.snapshot())),
    );
  });
  it('rejects corrupt, newer, invalid topology and nonfinite payloads', async () => {
    const snapshot = new Simulation(settings).snapshot();
    const bytes = await serialize(snapshot);
    await expect(deserialize(bytes.slice(0, 20))).rejects.toThrow();
    const future = bytes.slice(0);
    new DataView(future).setUint32(4, 100, true);
    await expect(deserialize(future)).rejects.toThrow('version');
    snapshot.terrain.heights[0] = NaN;
    await expect(deserialize(await serialize(snapshot))).rejects.toThrow();
    snapshot.terrain.heights[0] = 60;
    snapshot.nodes.push({
      id: 10,
      pos: { x: 0, z: 0 },
      height: 60,
      segments: [999],
      control: 'none',
    });
    snapshot.nextId = 11;
    await expect(deserialize(await serialize(snapshot))).rejects.toThrow();
  });
  it('loads atomically, rejects commands during decoding and preserves old city on failure', async () => {
    const events: SimEvent[] = [],
      dispatcher = new CommandDispatcher((e) => events.push(e), {
        serialize,
        deserialize,
      });
    dispatcher.handle({ t: 'init', reqId: 1, ...settings });
    dispatcher.handle({ t: 'save', reqId: 2 });
    await vi.waitFor(() => expect(events.at(-1)?.t).toBe('saved'));
    const saved = events.at(-1)!;
    if (saved.t !== 'saved') throw new Error();
    dispatcher.handle({ t: 'load', reqId: 3, data: saved.data });
    dispatcher.handle({ t: 'takeLoan', reqId: 4, bank: 0 });
    expect(events.at(-1)).toMatchObject({ ok: false, reason: 'err.notReady' });
    await vi.waitFor(() =>
      expect(events.at(-1)).toMatchObject({ t: 'ready', reqId: 3 }),
    );
    dispatcher.handle({ t: 'load', reqId: 5, data: new ArrayBuffer(20) });
    await vi.waitFor(() =>
      expect(events.at(-1)).toMatchObject({ reqId: 5, ok: false }),
    );
    dispatcher.handle({ t: 'takeLoan', reqId: 6, bank: 0 });
    expect(events.at(-1)).toMatchObject({ reqId: 6, ok: true });
  });
});
