import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import type { SimEvent } from '../../src/bridge/protocol';
import { MAP_PRESETS } from '../../src/data/terrain';
const settings = {
  seed: MAP_PRESETS[0].seed,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Inspect',
};
describe('read-only inspection', () => {
  it('returns a detached asset and rejects absent or unsupported targets', () => {
    const sim = new Simulation(settings);
    expect(sim.place('power_wind', { x: -80, z: -220 }, 0).ok).toBe(true);
    const b = sim.snapshot().buildings[0]!;
    const info = sim.inspect('building', b.id);
    expect(info).toMatchObject({
      kind: 'building',
      value: { defId: 'power_wind', paidCost: 2000 },
    });
    if (info?.kind === 'building') info.value.pos.x = 999;
    expect(sim.inspect('building', b.id)?.value).toMatchObject({
      pos: { x: -80 },
    });
    expect(sim.inspect('building', -1)).toBeNull();
    expect(sim.inspect('unknown', b.id)).toBeNull();
  });
  it('validates malformed worker targets without changing funds or assets', () => {
    const events: SimEvent[] = [];
    const dispatcher = new CommandDispatcher((e) => events.push(e));
    dispatcher.handle({ t: 'init', reqId: 1, ...settings });
    for (const target of [
      null,
      {},
      { kind: 'building', id: NaN },
      { kind: 0, id: 1 },
    ]) {
      dispatcher.handle({ t: 'inspect', reqId: 2, target });
      expect(events.at(-1)).toMatchObject({
        t: 'result',
        ok: false,
        reason: 'err.invalidCommand',
      });
    }
    dispatcher.handle({
      t: 'inspect',
      reqId: 3,
      target: { kind: 'building', id: 999 },
    });
    expect(events.at(-1)).toMatchObject({
      t: 'result',
      ok: false,
      reason: 'err.bulldozeMissing',
    });
    expect(events.filter((e) => e.t === 'fundsChanged')).toHaveLength(0);
  });
});
