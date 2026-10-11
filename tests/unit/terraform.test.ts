import { expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import {
  previewTerraform,
  isTerraformDraft,
  type TerraformDraft,
} from '../../src/world/terraform';
import { meshHeightAt } from '../../src/world/heightField';
import { MAP_SIZE, WORLD, SEA_LEVEL } from '../../src/data/config';
import { TERRAFORM } from '../../src/data/terraform';
import { WorldMirror } from '../../src/bridge/mirror';
import type { SimEvent } from '../../src/bridge/protocol';
import { CommandDispatcher } from '../../src/sim/commands';
import { serialize, deserialize } from '../../src/save/serializer';
import { uniqueState } from '../fixtures/uniqueCity';
function state() {
  const s = createState({
    seed: 412,
    mapId: 'valley',
    cityName: 'Terraform',
    mode: 'sandbox',
  });
  s.terrain.heights.fill(60);
  s.clock.speed = 0;
  return s;
}
const draft: TerraformDraft = {
  mode: 'raise',
  radius: 64,
  points: [{ x: 0, z: 0 }],
};
it('raises and lowers a bounded feathered region exactly once per stroke, then levels to the first sample', () => {
  const s = state(),
    sim = new Simulation(s.settings, undefined, s);
  expect(sim.terraform(draft)).toEqual({ ok: true, cost: 0 });
  let a = sim.snapshot();
  expect(meshHeightAt(a.terrain.heights, 0, 0)).toBe(64);
  expect(meshHeightAt(a.terrain.heights, 96, 0)).toBe(60);
  const money = a.money;
  expect(sim.terraform({ ...draft, mode: 'lower' }).ok).toBe(true);
  a = sim.snapshot();
  expect(meshHeightAt(a.terrain.heights, 0, 0)).toBe(60);
  expect(a.money).toBe(money);
  const repeated = previewTerraform(
    { ...s, heights: s.terrain.heights, mode: 'sandbox' },
    {
      ...draft,
      points: [
        { x: 0, z: 0 },
        { x: 0, z: 0 },
      ],
    },
  );
  const once = previewTerraform(
    { ...s, heights: s.terrain.heights, mode: 'sandbox' },
    draft,
  );
  expect(repeated.patch).toEqual(once.patch);
  const idx =
    (MAP_SIZE / 2 / WORLD.heightmapSpacingM) * WORLD.heightmapVertices +
    MAP_SIZE / 2 / WORLD.heightmapSpacingM;
  s.terrain.heights[idx] = 70;
  const flat = previewTerraform(
    { ...s, heights: s.terrain.heights, mode: 'sandbox' },
    {
      mode: 'flatten',
      radius: 64,
      points: [
        { x: -32, z: 0 },
        { x: 0, z: 0 },
      ],
    },
  );
  expect(flat.patch.heights[flat.patch.indices.indexOf(idx)]).toBe(60);
});
it('digs a continuous submerged channel and syncs sparse terrain to the mirror and save', async () => {
  const s = state(),
    events: SimEvent[] = [],
    mirror = new WorldMirror(),
    sim = new Simulation(
      s.settings,
      (e) => {
        events.push(e);
        mirror.apply(e);
      },
      s,
    );
  mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
  expect(
    sim.terraform({
      mode: 'river',
      radius: 64,
      points: [
        { x: -128, z: 128 },
        { x: 128, z: 128 },
      ],
    }).ok,
  ).toBe(true);
  const a = sim.snapshot();
  for (const x of [-128, -64, 0, 64, 128])
    expect(meshHeightAt(a.terrain.heights, x, 128)).toBe(
      SEA_LEVEL - TERRAFORM.riverDepthM,
    );
  expect(mirror.readRoadWorld()!.heights).toEqual(a.terrain.heights);
  expect(events.some((e) => e.t === 'roadsChanged' && !!e.terrain)).toBe(true);
  const restored = await deserialize(await serialize(a));
  expect(restored.terrain.heights).toEqual(a.terrain.heights);
  expect(restored.terrain.revision).toBe(a.terrain.revision);
});
it('rejects an entire stroke near buildings or roads without moving road geometry, IDs or money', () => {
  const s = uniqueState();
  s.settings.mode = 'sandbox';
  const sim = new Simulation(s.settings, undefined, s),
    before = sim.snapshot();
  for (const p of [
    { x: -150, z: 40 },
    { x: 0, z: 0 },
    { x: 0, z: 24 },
  ])
    expect(
      sim.terraform({ ...draft, points: [{ x: 0, z: 200 }, p] }).reason,
    ).toBe('err.terraformProtected');
  const after = sim.snapshot();
  expect(after.terrain.heights).toEqual(before.terrain.heights);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.segments).toEqual(before.segments);
  expect(after.buildings).toEqual(before.buildings);
  expect(after.nextId).toBe(before.nextId);
  expect(after.money).toBe(before.money);
  expect(sim.terraform({ ...draft, points: [{ x: 0, z: 200 }] }).ok).toBe(true);
  expect(sim.snapshot().nodes).toEqual(before.nodes);
});
it('validates sandbox, ownership, finite inputs, stroke limits and height bounds', () => {
  const s = state();
  s.settings.mode = 'normal';
  let sim = new Simulation(s.settings, undefined, s);
  expect(sim.terraform(draft).reason).toBe('err.terraformSandbox');
  s.settings.mode = 'sandbox';
  sim = new Simulation(s.settings, undefined, s);
  expect(sim.terraform({ ...draft, points: [{ x: 470, z: 0 }] }).reason).toBe(
    'err.landNotOwned',
  );
  for (const v of [
    null,
    {},
    { ...draft, radius: 33 },
    { ...draft, points: [] },
    { ...draft, points: [{ x: NaN, z: 0 }] },
    { ...draft, points: Array(65).fill({ x: 0, z: 0 }) },
  ])
    expect(isTerraformDraft(v)).toBe(false);
  s.terrain.heights.fill(WORLD.heightRangeM[1]);
  sim = new Simulation(s.settings, undefined, s);
  expect(sim.terraform(draft).reason).toBe('err.terraformEmpty');
  const e: SimEvent[] = [],
    d = new CommandDispatcher((v) => e.push(v));
  d.handle({ t: 'init', reqId: 1, ...s.settings });
  d.handle({
    t: 'terraform',
    reqId: 2,
    draft: { ...draft, points: [{ x: Infinity, z: 0 }] },
  });
  expect(e.at(-1)).toMatchObject({
    t: 'result',
    ok: false,
    reason: 'err.invalidCommand',
  });
});
