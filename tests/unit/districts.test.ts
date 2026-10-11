import { CommandDispatcher } from '../../src/sim/commands';
import { it, expect } from 'vitest';
import {
  districtBrush,
  districtCell,
  districtPoint,
  districtViews,
  paintDistrict,
  districtAt,
} from '../../src/world/districts';
import { districtCommand } from '../../src/sim/systems/districts';
import { busState } from '../fixtures/busCity';
import { serialize, deserialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
import { WorldMirror } from '../../src/bridge/mirror';
import type { SimEvent } from '../../src/bridge/protocol';
it('paints continuous strokes only in owned land and transfers ownership without mutating old districts', () => {
  const cells = districtBrush(
    [
      { x: -450, z: 0 },
      { x: 450, z: 0 },
    ],
    32,
    [12],
  );
  expect(cells).toContain(districtCell({ x: 0, z: 0 }));
  expect(cells.every((c) => Math.abs(districtPoint(c).x) < 480)).toBe(true);
  const original = [
    { id: 1, name: 'A', cells },
    { id: 2, name: 'B', cells: [] },
  ];
  const painted = districtBrush([{ x: 0, z: 0 }], 32, [12]);
  const next = paintDistrict(original, 2, painted);
  expect(districtAt(original, { x: 0, z: 0 })).toBe(1);
  expect(districtAt(next, { x: 0, z: 0 })).toBe(2);
  expect(next[0]!.cells.length).toBe(cells.length - painted.length);
  expect(districtAt(paintDistrict(next, null, painted), { x: 0, z: 0 })).toBe(
    0,
  );
  expect(districtBrush([{ x: 800, z: 0 }], 32, [12])).toEqual([]);
});
it('checks unlocking, names, IDs, owned land and limits atomically', () => {
  const s = busState();
  s.settings.mode = 'normal';
  s.unlocked = [0];
  const before = s.nextId;
  expect(districtCommand(s, { action: 'create', name: 'A' }).reason).toBe(
    'err.locked',
  );
  s.settings.mode = 'sandbox';
  expect(districtCommand(s, { action: 'create', name: '   ' }).reason).toBe(
    'err.districtName',
  );
  expect(s.nextId).toBe(before);
  expect(districtCommand(s, { action: 'create', name: ' A ' }).ok).toBe(true);
  const id = s.districts[0]!.id;
  expect(
    districtCommand(s, {
      action: 'paint',
      id,
      points: [{ x: 800, z: 0 }],
      radius: 32,
    }).reason,
  ).toBe('err.landNotOwned');
  expect(
    districtCommand(s, {
      action: 'paint',
      id,
      points: [{ x: Infinity, z: 0 }],
      radius: 32,
    }).ok,
  ).toBe(false);
  expect(
    districtCommand(s, {
      action: 'paint',
      id,
      points: [{ x: 0, z: 0 }],
      radius: 1,
    }).ok,
  ).toBe(false);
  expect(districtCommand(s, { action: 'rename', id: 9999, name: 'B' }).ok).toBe(
    false,
  );
  expect(s.districts[0]).toEqual({ id, name: 'A', cells: [] });
  for (let i = 1; i < 64; i++)
    districtCommand(s, { action: 'create', name: String(i) });
  expect(districtCommand(s, { action: 'create', name: '65' }).reason).toBe(
    'err.districtLimit',
  );
  expect(districtCommand(s, { action: 'delete', id }).ok).toBe(true);
  expect(s.districts).toHaveLength(63);
});
it('aggregates actual residents and workers by building position, then updates after repaint or demolition', () => {
  const s = busState(),
    cells = districtBrush(
      s.buildings.map((b) => b.pos),
      96,
      [12],
    );
  const ds = [{ id: s.nextId++, name: 'Central', cells }];
  let v = districtViews(ds, s.buildings)[0]!;
  expect(v.population).toBe(s.buildings.reduce((n, b) => n + b.residents, 0));
  expect(v.jobs).toBe(s.buildings.reduce((n, b) => n + b.jobs, 0));
  expect(v.workers).toBe(s.buildings.reduce((n, b) => n + b.workers, 0));
  expect(v.buildings).toBe(3);
  expect(v.area).toBe(cells.length * 256);
  v = districtViews(ds, s.buildings.slice(1))[0]!;
  expect(v.population).toBe(0);
  expect(v.buildings).toBe(2);
});
it('persists names and cells, emits authoritative statistics and rejects overlapping or duplicate IDs', async () => {
  const s = busState(),
    events: SimEvent[] = [],
    sim = new Simulation(s.settings, (e) => events.push(e), s);
  sim.districtCommand({ action: 'create', name: 'West' });
  const id = sim.snapshot().districts[0]!.id;
  sim.districtCommand({
    action: 'paint',
    id,
    points: [s.buildings[0]!.pos],
    radius: 96,
  });
  sim.districtCommand({ action: 'rename', id, name: 'Home' });
  const snapshot = sim.snapshot(),
    saved = await deserialize(await serialize(snapshot));
  expect(saved.districts).toEqual(snapshot.districts);
  const mirror = new WorldMirror();
  mirror.apply({ t: 'ready', reqId: 1, snapshot });
  expect(mirror.readDistricts()[0]!.population).toBeGreaterThan(0);
  expect(
    events.some((e) => e.t === 'districts' && e.districts[0]?.name === 'Home'),
  ).toBe(true);
  const bad = structuredClone(saved);
  bad.districts.push({ ...bad.districts[0]!, id: bad.nextId++ });
  await expect(deserialize(await serialize(bad))).rejects.toThrow();
  bad.districts[1]!.cells = [];
  bad.districts[1]!.id = bad.buildings[0]!.id;
  await expect(deserialize(await serialize(bad))).rejects.toThrow();
});

it('accepts district commands through the Worker boundary and rejects malformed payloads', () => {
  const events: SimEvent[] = [],
    dispatcher = new CommandDispatcher((e) => events.push(e));
  dispatcher.handle({
    t: 'init',
    reqId: 1,
    seed: 1,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: 'A',
  });
  dispatcher.handle({
    t: 'district',
    reqId: 2,
    action: 'create',
    name: 'West',
  });
  expect(events.at(-1)).toMatchObject({ t: 'result', reqId: 2, ok: true });
  expect(
    events.some((e) => e.t === 'districts' && e.districts[0]?.name === 'West'),
  ).toBe(true);
  dispatcher.handle({
    t: 'district',
    reqId: 3,
    action: 'paint',
    id: null,
    points: [{ x: NaN, z: 0 }],
    radius: 32,
  });
  expect(events.at(-1)).toMatchObject({
    ok: false,
    reason: 'err.invalidCommand',
  });
});
