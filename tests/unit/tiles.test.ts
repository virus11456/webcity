import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import {
  previewTile,
  tileAllowance,
  tilePrice,
  deviceTileLimit,
} from '../../src/world/tiles';
import { MILESTONES } from '../../src/data/milestones';
import { WorldMirror } from '../../src/bridge/mirror';
import { migrateSave } from '../../src/save/migrations';
import { serialize, deserialize } from '../../src/save/serializer';
import { CommandDispatcher } from '../../src/sim/commands';
import type { SimEvent } from '../../src/bridge/protocol';
const settings = {
  seed: 410,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Tiles',
};
function state() {
  const s = createState(settings);
  s.money = 2000000;
  s.unlocked = MILESTONES.map((m) => m.id);
  s.clock.speed = 0;
  s.terrain.heights.fill(60);
  return s;
}
describe('land purchases', () => {
  it('requires exact shared-edge adjacency, bounds, ownership, milestones and sufficient money', () => {
    const s = state();
    expect(previewTile(s, 0, 0).reason).toBe('err.tileAdjacent');
    expect(previewTile(s, 1, 1).reason).toBe('err.tileAdjacent');
    expect(previewTile(s, 2, 2).reason).toBe('err.tileOwned');
    for (const p of [
      [-1, 2],
      [5, 2],
      [2, 0.5],
      [NaN, 2],
    ])
      expect(previewTile(s, p[0]!, p[1]!).reason).toBe('err.invalidCommand');
    s.unlocked = [0, 1, 2];
    expect(previewTile(s, 3, 2).reason).toBe('err.locked');
    s.unlocked.push(3);
    expect(tileAllowance(s)).toBe(2);
    s.money = 49999;
    expect(previewTile(s, 3, 2).reason).toBe('err.notEnoughMoney');
    s.money = 50000;
    expect(previewTile(s, 3, 2)).toEqual({ ok: true, cost: 50000 });
    s.ownedTiles = [4];
    expect(previewTile(s, 0, 1).reason).toBe('err.tileAdjacent');
  });
  it('charges progressively once, updates the mirror, and permits construction immediately in new land', () => {
    const s = state(),
      events: SimEvent[] = [],
      sim = new Simulation(settings, (e) => events.push(e), s),
      mirror = new WorldMirror();
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    const points = {
      start: { x: 600, z: 0 },
      c1: { x: 632, z: 0 },
      c2: { x: 664, z: 0 },
      end: { x: 696, z: 0 },
      elevated: false,
    };
    expect(sim.buildRoad('road_small', points).ok).toBe(false);
    expect(sim.buyTile(3, 2)).toEqual({ ok: true, cost: 50000 });
    expect(sim.buyTile(3, 2).ok).toBe(false);
    events.forEach((e) => mirror.apply(e));
    expect(mirror.readOwnedTiles()).toEqual([12, 13]);
    expect(mirror.readTileWorld()!.money).toBe(1950000);
    expect(sim.buildRoad('road_small', points).ok).toBe(true);
    expect(sim.buyTile(4, 2)).toEqual({ ok: true, cost: 80000 });
    expect(tilePrice(3)).toBe(110000);
  });
  it('enforces four tiles on phones and nine on desktop, preserves larger existing cities on mobile', () => {
    expect(deviceTileLimit('Mozilla iPhone')).toBe(4);
    expect(deviceTileLimit('Mozilla iPad')).toBe(9);
    expect(deviceTileLimit('Chrome Desktop')).toBe(9);
    const s = state(),
      phone = new Simulation(settings, undefined, s, 4);
    for (const id of [13, 14, 9])
      expect(phone.buyTile(id % 5, Math.floor(id / 5)).ok).toBe(true);
    expect(phone.buyTile(3, 1).reason).toBe('err.tileLimit');
    expect(phone.snapshot().ownedTiles).toHaveLength(4);
    const desktop = new Simulation(settings, undefined, s, 9);
    for (const id of [13, 14, 9, 8, 7, 6, 11, 16])
      expect(desktop.buyTile(id % 5, Math.floor(id / 5)).ok).toBe(true);
    expect(desktop.buyTile(0, 3).reason).toBe('err.tileLimit');
    const imported = new Simulation(settings, undefined, desktop.snapshot(), 4);
    expect(imported.snapshot().ownedTiles).toHaveLength(9);
    expect(imported.buyTile(0, 3).reason).toBe('err.tileLimit');
  });
  it('keeps sandbox free while still respecting adjacency and device limits', () => {
    const s = state();
    s.settings.mode = 'sandbox';
    s.tileLimit = 4;
    s.money = 0;
    const sim = new Simulation(s.settings, undefined, s);
    expect(sim.buyTile(0, 0).ok).toBe(false);
    for (const id of [13, 14, 9])
      expect(sim.buyTile(id % 5, Math.floor(id / 5))).toEqual({
        ok: true,
        cost: 0,
      });
    expect(sim.buyTile(3, 1).ok).toBe(false);
    expect(sim.snapshot().money).toBe(0);
  });
  it('roundtrips land ownership, migrates missing limits, rejects malformed saves and worker requests', async () => {
    const s = state(),
      sim = new Simulation(settings, undefined, s, 4);
    sim.buyTile(3, 2);
    const saved = await deserialize(await serialize(sim.snapshot()));
    expect(saved.ownedTiles).toEqual([12, 13]);
    expect(saved.tileLimit).toBe(4);
    const old = structuredClone(saved);
    Reflect.deleteProperty(old, 'tileLimit');
    expect(migrateSave(old, 1).tileLimit).toBe(9);
    for (const ids of [[12, 12], [25], []]) {
      const bad = structuredClone(saved);
      bad.ownedTiles = ids;
      expect(() => migrateSave(bad, 1)).toThrow();
    }
    const events: SimEvent[] = [],
      dispatcher = new CommandDispatcher((e) => events.push(e));
    dispatcher.handle({ t: 'init', reqId: 1, ...settings, tileLimit: 5 });
    expect(events.at(-1)).toMatchObject({ ok: false });
    dispatcher.handle({
      t: 'init',
      reqId: 2,
      ...settings,
      mode: 'sandbox',
      tileLimit: 4,
    });
    dispatcher.handle({ t: 'buyTile', reqId: 3, tx: 3, tz: 2 });
    expect(events.at(-1)).toMatchObject({ ok: true });
    dispatcher.handle({ t: 'buyTile', reqId: 4, tx: 3.5, tz: 2 });
    expect(events.at(-1)).toMatchObject({ ok: false });
  });
});
