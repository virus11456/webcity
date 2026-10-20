import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { deepStrictEqual } from 'node:assert/strict';
import { decode } from '@msgpack/msgpack';
import { expect, it } from 'vitest';
import manifest from '../fixtures/saves/manifest.json';
import { SAVE } from '../../src/data/persistence';
import { deserialize, serialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';

it('retains frozen fixtures for every released format through the current version', () => {
  const versions = [...new Set(manifest.map((f) => f.version))].sort(
    (a, b) => a - b,
  );
  expect(versions).toEqual(
    Array.from({ length: SAVE.version }, (_, i) => i + 1),
  );
  expect(new Set(manifest.map((f) => f.file)).size).toBe(manifest.length);
});

it.each(manifest)(
  'migrates immutable $file and continues deterministically',
  async (fixture) => {
    const original = new Uint8Array(
      await readFile(
        new URL(`../fixtures/saves/${fixture.file}`, import.meta.url),
      ),
    );
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      fixture.sha256,
    );
    expect(new TextDecoder().decode(original.slice(0, 4))).toBe('WCTY');
    expect(new DataView(original.buffer).getUint32(4, true)).toBe(
      fixture.version,
    );
    // Inspect the archived shape without applying today's migration or typed-array codec.
    const raw = decode(gunzipSync(original.slice(8))) as Record<
      string,
      unknown
    >;
    if (fixture.citizenSchema === 'reserved-array')
      expect(raw.citizens).toEqual([]);
    else {
      const citizens = raw.citizens as Record<string, unknown>;
      expect(citizens.count).toBe(6);
      expect(Object.hasOwn(citizens, 'locationId')).toBe(
        fixture.citizenSchema === 'journeys-and-health',
      );
      expect(Object.hasOwn(citizens, 'healthFraction')).toBe(
        fixture.citizenSchema === 'journeys-and-health',
      );
    }
    const migrated = await deserialize(original.buffer);
    expect(migrated.settings.cityName).toBe('歷史存檔回歸城');
    expect(migrated.money).toBe(90000);
    expect(migrated.taxRates.RL).toBe(0.15);
    expect(migrated.loans).toEqual([
      { bank: 0, remaining: 20000, weeksLeft: 52 },
    ]);
    expect(migrated.buildings).toHaveLength(1);
    expect(migrated.buildings[0]).toMatchObject({
      id: 10001,
      defId: 'RL',
      residents: 6,
      pos: { x: -160, z: -88 },
    });
    expect(migrated.segments).toHaveLength(1);
    expect(migrated.segments[0]).toMatchObject({
      type: 'road_small',
      length: 160,
    });
    expect(migrated.nextId).toBe(10002);
    expect(migrated.terrain.heights).toBeInstanceOf(Float32Array);
    expect(migrated.terrain.heights.every((h) => h === 60)).toBe(true);
    expect(migrated.citizens.locationId).toBeInstanceOf(Int32Array);
    expect(migrated.citizens.healthFraction).toBeInstanceOf(Uint8Array);
    expect(migrated.disasters?.enabled).toBe(false);
    expect(migrated.tutorial?.status).toBe('skipped');
    const ids = migrated.citizens.id.slice(0, migrated.citizens.count);
    const city = new Simulation(migrated.settings, undefined, migrated);
    const normalized = city.snapshot();
    expect(normalized.stats.population).toBe(6);
    expect(normalized.citizens.count).toBe(6);
    if (ids.length) deepStrictEqual(normalized.citizens.id.slice(0, 6), ids);
    expect(normalized.money).toBe(90000);
    const saved = await serialize(normalized);
    const loaded = await deserialize(saved);
    deepStrictEqual(
      new Uint8Array(await serialize(loaded)),
      new Uint8Array(saved),
    );
    const restored = new Simulation(loaded.settings, undefined, loaded);
    city.setSpeed(1);
    restored.setSpeed(1);
    for (let i = 0; i < 20; i++) {
      city.tick();
      restored.tick();
    }
    expect(city.snapshot().clock.ticks).toBe(20);
    deepStrictEqual(
      new Uint8Array(await serialize(city.snapshot())),
      new Uint8Array(await serialize(restored.snapshot())),
    );
    // Reading and migration must never rewrite the archived input.
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      fixture.sha256,
    );
  },
);
