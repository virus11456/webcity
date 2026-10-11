import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { createState } from '../../src/sim/state';
import { CommandDispatcher } from '../../src/sim/commands';
import { WorldMirror } from '../../src/bridge/mirror';
import {
  createTutorial,
  validTutorial,
  tutorialStepReady,
  tutorialUtility,
} from '../../src/world/tutorial';
import { serialize, deserialize } from '../../src/save/serializer';
import { MAP_SIZE, WORLD } from '../../src/data/config';
import { TUTORIAL } from '../../src/data/tutorial';
import { zoneCellCenter } from '../../src/world/zoneGrid';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import type { SimEvent } from '../../src/bridge/protocol';
import type { RoadDraft } from '../../src/world/snapshot';
const settings = {
  seed: 72,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: '教學測試',
  starterRoads: true,
  tutorial: true,
};
const draft = (ax: number, az: number, bx: number, bz: number): RoadDraft => ({
  start: { x: ax, z: az },
  c1: { x: ax + (bx - ax) / 3, z: az + (bz - az) / 3 },
  c2: { x: ax + (2 * (bx - ax)) / 3, z: az + (2 * (bz - az)) / 3 },
  end: { x: bx, z: bz },
  elevated: false,
});
function city() {
  const s = createState(settings);
  s.terrain.heights.fill(58);
  for (let z = 0; z < WORLD.heightmapVertices; z++)
    for (let x = 0; x < WORLD.heightmapVertices; x++)
      if (x * 16 - MAP_SIZE / 2 >= 320)
        s.terrain.heights[z * WORLD.heightmapVertices + x] = 36;
  return new Simulation(settings, () => {}, s);
}
function roads(sim: Simulation) {
  expect(sim.buildRoad('road_small', draft(-288, -192, -128, -192)).ok).toBe(
    true,
  );
  expect(sim.buildRoad('road_small', draft(-128, -192, -128, 0)).ok).toBe(true);
  expect(sim.buildRoad('road_small', draft(-128, 0, 160, 0)).ok).toBe(true);
}
function zones(sim: Simulation) {
  for (const [i, zone] of (['RL', 'CL', 'I'] as const).entries()) {
    const block = sim.snapshot().zoneBlocks[i * 2]!;
    const cells = Array.from(
      block.cells,
      (_, j) => [block.id, j] as [number, number],
    ).filter(([, j]) => block.cells[j] !== 255);
    expect(sim.zone(cells, zone).ok).toBe(true);
  }
}
describe('new city tutorial', () => {
  it('requires all camera gestures, ramp-connected roads and all three RCI zones in order', () => {
    const sim = city();
    expect(sim.snapshot().clock.speed).toBe(0);
    sim.tutorialAction('finance');
    sim.tutorialAction('zoom');
    sim.tutorialAction('zoom');
    expect(sim.snapshot().tutorial?.step).toBe(0);
    sim.tutorialAction('pan');
    sim.tutorialAction('rotate');
    expect(sim.snapshot().tutorial?.step).toBe(1);
    expect(sim.buildRoad('road_small', draft(100, 200, 260, 200)).ok).toBe(
      true,
    );
    expect(sim.snapshot().tutorial?.step).toBe(1);
    roads(sim);
    expect(sim.snapshot().tutorial?.step).toBe(3);
    zones(sim);
    expect(sim.snapshot().tutorial?.step).toBe(4);
    const block = sim.snapshot().zoneBlocks.find((b) => b.cells.includes(1))!;
    const home = zoneCellCenter(block, block.cells.indexOf(1));
    const wind = { x: home.x + 100, z: home.z - 70 };
    expect(sim.place('power_wind', wind, 0).ok).toBe(true);
    expect(sim.snapshot().tutorial?.step).toBe(4);
    expect(sim.buildPowerLine([wind, home]).ok).toBe(true);
    expect(sim.snapshot().tutorial?.step).toBe(5);
    const pump = { x: 288, z: 120 },
      drain = { x: 288, z: 280 };
    expect(sim.place('water_pump', pump, -Math.PI / 2).ok).toBe(true);
    expect(sim.place('water_drain', drain, -Math.PI / 2).ok).toBe(true);
    expect(sim.snapshot().tutorial?.step).toBe(5);
    expect(sim.buildWaterPipes([pump, drain, home]).ok).toBe(true);
    expect(sim.snapshot().tutorial?.step).toBe(6);
    sim.setSpeed(4);
    for (let i = 0; i < 1000 && sim.snapshot().tutorial?.step === 6; i++)
      sim.tick();
    expect(sim.snapshot().tutorial?.step).toBe(7);
    const balance = sim.snapshot().money;
    sim.tutorialAction('finance');
    expect(sim.snapshot().tutorial?.status).toBe('completed');
    expect(sim.snapshot().money).toBe(balance + TUTORIAL.reward);
  });
  it('requires physically connected utility networks, a drain on the same pipe island, and active sources', () => {
    const sim = city();
    roads(sim);
    zones(sim);
    const s = sim.snapshot(),
      block = s.zoneBlocks.find((b) => b.cells.includes(1))!;
    const home = zoneCellCenter(block, block.cells.indexOf(1));
    const b = (id: number, x: number, defId: string) => ({
      ...districtFixture(1)[0]!,
      id,
      defId,
      kind: 'utility' as const,
      pos: { x, z: home.z },
      state: 'active' as const,
      rotation: 0,
      lotW: 2,
      lotD: 2,
    });
    s.buildings = [
      b(1000, home.x - 200, 'water_pump'),
      b(1001, home.x + 200, 'water_drain'),
    ];
    const pipe = (id: number, a: number, c: number) => ({
      id,
      points: [
        { x: a, z: home.z },
        { x: c, z: home.z },
      ],
    });
    s.networks.water = [
      pipe(1100, home.x - 200, home.x - 50),
      pipe(1101, home.x, home.x + 200),
    ];
    expect(tutorialUtility(s, 'water')).toBe(false);
    s.networks.water.push(pipe(1102, home.x - 55, home.x + 10));
    expect(tutorialUtility(s, 'water')).toBe(true);
    s.buildings[0]!.enabled = false;
    expect(tutorialUtility(s, 'water')).toBe(false);
    s.buildings[0]!.enabled = true;
    s.buildings.pop();
    expect(tutorialUtility(s, 'water')).toBe(false);
    s.buildings[0]!.defId = 'power_wind';
    s.networks.power = s.networks.water;
    expect(tutorialUtility(s, 'power')).toBe(true);
    s.networks.power.pop();
    expect(tutorialUtility(s, 'power')).toBe(false);
  });
  it('waits for time to run and a completed private building, then rewards finance once across saves', async () => {
    const built = city();
    roads(built);
    zones(built);
    const start = built.snapshot();
    start.tutorial = { ...createTutorial(true), step: 6, camera: 7 };
    const sim = new Simulation(settings, () => {}, start);
    expect(tutorialStepReady(sim.snapshot(), 6)).toBe(false);
    sim.setSpeed(4);
    for (let i = 0; i < 1000 && sim.snapshot().tutorial!.step === 6; i++)
      sim.tick();
    expect(sim.snapshot().tutorial!.step).toBe(7);
    const money = sim.snapshot().money;
    sim.tutorialAction('finance');
    sim.tutorialAction('finance');
    expect(sim.snapshot().money).toBe(money + TUTORIAL.reward);
    expect(sim.snapshot().stats.money).toBe(sim.snapshot().money);
    const snapshot = await deserialize(await serialize(sim.snapshot()));
    const loaded = new Simulation(snapshot.settings, () => {}, snapshot);
    loaded.tutorialAction('finance');
    loaded.tutorialAction('skip');
    loaded.tutorialAction('dismiss');
    expect(loaded.snapshot().money).toBe(snapshot.money);
    expect(loaded.snapshot().tutorial).toMatchObject({
      status: 'completed',
      step: 8,
      dismissed: true,
    });
  });
  it('does not join separate water islands through the pump coverage radius', () => {
    const w = city().snapshot();
    w.zoneBlocks = [
      {
        id: 500,
        segment: 1,
        side: 1,
        origin: { x: 0, z: 0 },
        dir: { x: 1, z: 0 },
        width: 1,
        cells: new Uint8Array([1]),
        buildingAt: new Int32Array([-1]),
      },
    ];
    w.buildings = [-200, 200].map((x, i) => ({
      ...districtFixture(1)[0]!,
      id: 1000 + i,
      kind: 'utility' as const,
      defId: i === 0 ? 'water_pump' : 'water_drain',
      pos: { x, z: 0 },
      state: 'active' as const,
      lotW: 2,
      lotD: 2,
      rotation: 0,
    }));
    w.networks.water = [
      {
        id: 1100,
        points: [
          { x: -180, z: -20 },
          { x: 220, z: -20 },
        ],
      },
    ];
    expect(tutorialUtility(w, 'water')).toBe(true);
    w.networks.water.push({
      id: 1101,
      points: [
        { x: -210, z: 0 },
        { x: -200, z: 0 },
      ],
    });
    expect(tutorialUtility(w, 'water')).toBe(false);
  });
  it('persists partial camera progress and skipping without a reward', async () => {
    const sim = city(),
      money = sim.snapshot().money;
    sim.tutorialAction('pan');
    const s = await deserialize(await serialize(sim.snapshot()));
    expect(s.tutorial?.camera).toBe(1);
    const restored = new Simulation(settings, () => {}, s);
    restored.tutorialAction('skip');
    for (const action of ['pan', 'rotate', 'zoom', 'finance'] as const)
      restored.tutorialAction(action);
    expect(restored.snapshot().tutorial?.status).toBe('skipped');
    expect(restored.snapshot().money).toBe(money);
    expect(
      (await deserialize(await serialize(restored.snapshot()))).tutorial
        ?.status,
    ).toBe('skipped');
  });
  it('keeps old cities out of the tutorial and rejects malformed saves', async () => {
    const s = city().snapshot();
    delete s.tutorial;
    expect((await deserialize(await serialize(s))).tutorial).toEqual(
      createTutorial(),
    );
    for (const invalid of [
      { ...createTutorial(true), camera: 8 },
      { ...createTutorial(true), step: 8 },
      { ...createTutorial(true), step: 3 },
      { ...createTutorial(), dismissed: true },
    ]) {
      expect(validTutorial(invalid)).toBe(false);
      s.tutorial = invalid;
      await expect(deserialize(await serialize(s))).rejects.toThrow();
    }
  });
  it('validates commands, mirrors progress defensively and ignores premature finance claims', () => {
    const events: SimEvent[] = [],
      mirror = new WorldMirror();
    const dispatch = new CommandDispatcher((e) => {
      events.push(e);
      mirror.apply(e);
    });
    dispatch.handle({ t: 'init', reqId: 1, ...settings });
    dispatch.handle({ t: 'tutorial', reqId: 2, action: 'complete' });
    expect(events.at(-1)).toMatchObject({
      ok: false,
      reason: 'err.invalidCommand',
    });
    dispatch.handle({ t: 'tutorial', reqId: 3, action: 'finance' });
    expect(mirror.readTutorial()?.step).toBe(0);
    dispatch.handle({ t: 'tutorial', reqId: 4, action: 'pan' });
    const view = mirror.readTutorial()!;
    view.camera = 7;
    expect(mirror.readTutorial()?.camera).toBe(1);
    expect(mirror.readFinance()?.money).toBe(70000);
  });
});
