import { migrateSave } from '../../src/save/migrations';
import { describe, expect, it } from 'vitest';
import {
  diffusePollution,
  updatePollution,
  updateNoise,
  updateWaterPollution,
  updateLandValue,
  smoothField,
  FieldsSystem,
} from '../../src/sim/systems/fields';
import { updateWater } from '../../src/sim/systems/water';
import { updatePower } from '../../src/sim/systems/power';
import { fieldIndex } from '../../src/world/fieldSampling';
import { intakePoint } from '../../src/world/waterUtility';
import { environmentState, environmentCity } from '../fixtures/environmentCity';
import { Simulation } from '../../src/sim/simulation';
import { serialize, deserialize } from '../../src/save/serializer';
import { WorldMirror } from '../../src/bridge/mirror';
describe('environmental fields', () => {
  it('diffuses 10% equally into 8 neighbors and decays 5%, reflecting map borders', () => {
    const source = new Float32Array(9);
    source[4] = 100;
    const result = diffusePollution(source, 3);
    expect(result[4]).toBeCloseTo(85.5);
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8])
      expect(result[i]).toBeCloseTo(1.1875);
    expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(95);
    source.fill(0);
    source[0] = 100;
    expect(diffusePollution(source, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(
      95,
    );
    expect(diffusePollution(new Float32Array([100]), 1)[0]).toBeCloseTo(95);
  });
  it('emits actual active industry jobs and coal sources, and stops emissions when removed', () => {
    const s = environmentState(),
      b = s.buildings[0]!;
    s.buildings = [
      {
        ...b,
        defId: 'I',
        jobs: 100,
        pos: { x: 8, z: 0 },
        rotation: 0,
        lotW: 2,
        lotD: 2,
      },
    ];
    updatePollution(s);
    const i = fieldIndex({ x: 8, z: 8 }, s.fields.size);
    expect(s.fields.pollution[i]).toBeCloseTo(47.5);
    s.buildings = [];
    updatePollution(s);
    expect(s.fields.pollution[i]).toBeLessThan(47.5);
    s.fields.pollution.fill(0);
    s.buildings = [{ ...b, defId: 'power_coal', kind: 'utility' }];
    updatePollution(s);
    expect(Math.max(...s.fields.pollution)).toBe(100);
  });
  it('uses actual road traffic and inverse-square noise falloff; nearby trees reduce noise by 20%', () => {
    const s = environmentState(),
      b = s.buildings[0]!;
    s.buildings = [
      {
        ...b,
        kind: 'utility',
        defId: 'power_wind',
        pos: { x: 8, z: 0 },
        rotation: 0,
        lotW: 2,
        lotD: 2,
      },
    ];
    updateNoise(s);
    const near = fieldIndex({ x: 8, z: 8 }, s.fields.size),
      far = fieldIndex({ x: 40, z: 8 }, s.fields.size);
    expect(s.fields.noise[near]).toBeCloseTo(60);
    expect(s.fields.noise[far]).toBeCloseTo(12);
    s.buildings.push({
      ...b,
      id: 20000,
      kind: 'park',
      defId: 'tree',
      pos: { x: 8, z: 4 },
      rotation: 0,
      lotW: 1,
      lotD: 1,
    });
    updateNoise(s);
    expect(s.fields.noise[near]).toBeCloseTo(48);
    s.buildings = [];
    updateNoise(s);
    expect(s.fields.noise.every((v) => v === 0)).toBe(true);
    updateNoise(s, new Map([[s.segments[0]!.id, { count: 10 }]]));
    expect(
      s.fields.noise[fieldIndex({ x: 80, z: 0 }, s.fields.size)],
    ).toBeGreaterThan(0);
  });
  it('advects real sewage downstream into a powered pump and distributes contaminated drinking water by pipe island', () => {
    const s = environmentState();
    updatePower(s);
    updateWater(s);
    const home = s.buildings[0]!,
      pump = s.buildings[1]!,
      drain = s.buildings[2]!;
    expect(drain.sewageDischarge).toBeGreaterThan(0);
    updateWaterPollution(s);
    const p = fieldIndex(intakePoint(pump.pos, pump.rotation), s.fields.size);
    expect(s.fields.waterPollution[p]).toBe(0);
    updateWaterPollution(s);
    updateWater(s);
    expect(s.fields.waterPollution[p]).toBeGreaterThan(0);
    expect(home.drinkingWaterPollution).toBeCloseTo(
      s.fields.waterPollution[p]!,
    );
    const upstream = fieldIndex({ x: 16, z: -128 }, s.fields.size);
    expect(s.fields.waterPollution[upstream]).toBe(0);
    s.networks.water = [];
    updateWater(s);
    expect(home.drinkingWaterPollution).toBe(0);
    expect(drain.sewageDischarge).toBe(0);
    for (let i = 0; i < 3; i++) updateWaterPollution(s);
    expect(s.fields.waterPollution[p]).toBe(0);
  });
  it('treatment removes 85% of its actual discharge pollution and an unpowered outlet emits none', () => {
    const a = environmentState(),
      b = environmentState();
    b.buildings[2]!.defId = 'water_treatment';
    for (const s of [a, b]) {
      updatePower(s);
      updateWater(s);
      updateWaterPollution(s);
    }
    const i = fieldIndex(
      intakePoint(a.buildings[2]!.pos, a.buildings[2]!.rotation),
      a.fields.size,
    );
    expect(a.fields.waterPollution[i]).toBeGreaterThan(0);
    expect(b.fields.waterPollution[i]).toBeCloseTo(
      a.fields.waterPollution[i]! * 0.15,
    );
    b.fields.waterPollution.fill(0);
    b.buildings[2]!.flags = 0;
    updateWater(b);
    updateWaterPollution(b);
    expect(b.fields.waterPollution.every((v) => v === 0)).toBe(true);
  });
  it('combines service, waterfront, pollution, noise and abandonment and smooths exactly once', () => {
    const s = environmentState();
    s.buildings = [];
    s.fields.coverage.police.fill(1);
    s.fields.coverage.fire.fill(1);
    s.fields.coverage.health.fill(1);
    s.fields.coverage.education.fill(1);
    s.fields.pollution.fill(10);
    s.fields.noise.fill(20);
    updateLandValue(s);
    expect(
      s.fields.landValue[fieldIndex({ x: 8, z: 8 }, s.fields.size)],
    ).toBeCloseTo(31);
    expect(
      s.fields.landValue[fieldIndex({ x: 1000, z: 8 }, s.fields.size)],
    ).toBeCloseTo(23);
    s.buildings = [
      {
        ...environmentState().buildings[0]!,
        state: 'abandoned',
        pos: { x: 8, z: 0 },
        rotation: 0,
      },
    ];
    updateLandValue(s);
    expect(
      s.fields.landValue[fieldIndex({ x: 8, z: 8 }, s.fields.size)],
    ).toBeCloseTo(21);
    const raw = new Float32Array(9);
    raw[4] = 90;
    expect(smoothField(raw, 3)[4]).toBe(10);
    expect(smoothField(raw, 3)[0]).toBe(22.5);
  });
  it('rejects corrupt environment fields and accepts older snapshots for migration', () => {
    const s = new Simulation(
      environmentState().settings,
      undefined,
      environmentState(),
    ).snapshot();
    const bad = structuredClone(s);
    bad.fields.pollution[10] = NaN;
    expect(() => migrateSave(bad, 1)).toThrow('Invalid save');
    delete s.environmentVersion;
    for (const b of s.buildings) delete b.environment;
    expect(
      new Simulation(s.settings, undefined, migrateSave(s, 1)).snapshot()
        .environmentVersion,
    ).toBe(1);
  });
  it('updates fields on four separate fixed steps, once per tick', () => {
    const s = environmentState(),
      system = new FieldsSystem(s),
      types: string[] = [];
    s.fields.pollution[0] = 50;
    updatePower(s);
    updateWater(s);
    for (let i = 1; i <= 9; i++) {
      s.clock.ticks = i;
      s.clock.tickInDay = i;
      const result = system.step();
      if (result) types.push(...result.fields);
      expect(system.step()).toBeUndefined();
    }
    expect(types).toEqual([
      'pollution',
      'noise',
      'waterPollution',
      'landValue',
    ]);
  });
  it('real dirty water lowers resident health, and mid-cycle saves resume without replaying diffusion', async () => {
    const f = await environmentCity(),
      start = await deserialize(new Uint8Array(f.data).buffer),
      mirror = new WorldMirror();
    const a = new Simulation(start.settings, (e) => mirror.apply(e), start);
    mirror.apply({ t: 'ready', reqId: 1, snapshot: a.snapshot() });
    a.setSpeed(1);
    for (let i = 0; i < 15; i++) a.tick();
    const checkpoint = a.snapshot();
    const b = new Simulation(
      start.settings,
      undefined,
      await deserialize(await serialize(checkpoint)),
    );
    expect(b.snapshot().fields).toEqual(checkpoint.fields);
    for (let i = 0; i < 45; i++) {
      a.tick();
      b.tick();
    }
    const left = a.snapshot(),
      right = b.snapshot();
    expect(left.citizens.health).toEqual(right.citizens.health);
    expect(left.citizens.healthFraction).toEqual(right.citizens.healthFraction);
    expect(left.fields).toEqual(right.fields);
    expect(left.buildings[0]!.drinkingWaterPollution).toBeGreaterThan(0);
    expect(left.buildings[0]!.health!.average).toBeLessThan(100);
    expect(mirror.readBuildings()[0]!.environment).toEqual(
      left.buildings[0]!.environment,
    );
    expect(left.buildings[2]!.sewageDischarge).toBeGreaterThan(0);
  });
});

it.each([1, 2, 3, 17, 300])(
  'smooths a %i-cell-wide field exactly like the bounded reference stencil',
  (size) => {
    const source = Float32Array.from(
      { length: size * size },
      (_, i) => ((i * 37) % 1001) / 7 - 20,
    );
    const original = source.slice(),
      expected = new Float32Array(source.length);
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        let sum = 0,
          count = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            if (z + dz < 0 || z + dz >= size || x + dx < 0 || x + dx >= size)
              continue;
            sum += source[(z + dz) * size + x + dx]!;
            count++;
          }
        expected[z * size + x] = Math.max(0, Math.min(100, sum / count));
      }
    expect(smoothField(source, size)).toEqual(expected);
    expect(source).toEqual(original);
  },
);
