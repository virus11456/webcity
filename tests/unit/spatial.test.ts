import { expect, it } from 'vitest';
import { SpatialHash } from '../../src/core/spatial';
import { Rng } from '../../src/core/rng';

it('inserts, moves, removes and clears points without aliasing', () => {
  const hash = new SpatialHash<string>(8),
    p = { x: -1, z: -8 };
  hash.set('a', p);
  hash.set('b', { x: 0, z: 0 });
  p.x = 100;
  expect(hash.size).toBe(2);
  expect(hash.queryRadius({ x: -1, z: -8 }, 0)).toEqual(['a']);
  hash.set('a', { x: 20, z: 20 });
  expect(hash.size).toBe(2);
  expect(hash.queryRadius({ x: -1, z: -8 }, 1)).toEqual([]);
  expect(hash.queryRadius({ x: 20, z: 20 }, 0)).toEqual(['a']);
  expect(hash.delete('a')).toBe(true);
  expect(hash.delete('a')).toBe(false);
  hash.clear();
  expect(hash.size).toBe(0);
  expect(hash.queryBox({ x: -1, z: -1 }, { x: 1, z: 1 })).toEqual([]);
});
it('includes exact boundaries, filters bucket corners and keeps colocated IDs', () => {
  const hash = new SpatialHash(10);
  hash.set(1, { x: 0, z: 0 });
  hash.set(2, { x: 3, z: 4 });
  hash.set(3, { x: 4, z: 4 });
  hash.set(4, { x: 3, z: 4 });
  for (let i = 10; i < 30; i++) hash.set(i, { x: i * 10, z: i * 10 });
  expect(hash.queryRadius({ x: 0, z: 0 }, 5).sort()).toEqual([1, 2, 4]);
  expect(hash.queryBox({ x: 3, z: 4 }, { x: 3, z: 4 }).sort()).toEqual([2, 4]);
  expect(hash.queryBox({ x: -20, z: -20 }, { x: -1, z: -1 })).toEqual([]);
  hash.delete(2);
  expect(hash.queryRadius({ x: 3, z: 4 }, 0)).toEqual([4]);
});
it('matches a brute-force oracle after deterministic moves and removals', () => {
  const hash = new SpatialHash(8),
    points = new Map<number, { x: number; z: number }>(),
    rng = new Rng(700);
  for (let i = 0; i < 200; i++) {
    const p = { x: rng.float(-100, 100), z: rng.float(-100, 100) };
    hash.set(i, p);
    points.set(i, p);
  }
  for (let i = 0; i < 100; i++) {
    if (i % 3 === 0) {
      hash.delete(i);
      points.delete(i);
    } else {
      const p = { x: rng.float(-100, 100), z: rng.float(-100, 100) };
      hash.set(i, p);
      points.set(i, p);
    }
  }
  for (let i = 0; i < 50; i++) {
    const p = { x: rng.float(-100, 100), z: rng.float(-100, 100) },
      radius = rng.float(0, 60);
    const expected = [...points]
      .filter(([, v]) => Math.hypot(v.x - p.x, v.z - p.z) <= radius)
      .map(([id]) => id)
      .sort((a, b) => a - b);
    expect(hash.queryRadius(p, radius).sort((a, b) => a - b)).toEqual(expected);
  }
  expect(hash.queryRadius({ x: 0, z: 0 }, 1e12)).toHaveLength(points.size);
});
it('rejects invalid inputs without removing an existing entry', () => {
  for (const size of [0, -1, Infinity, NaN])
    expect(() => new SpatialHash(size)).toThrow(RangeError);
  const hash = new SpatialHash(8);
  hash.set(1, { x: 0, z: 0 });
  expect(() => hash.set(1, { x: Infinity, z: 0 })).toThrow(RangeError);
  expect(hash.size).toBe(1);
  for (const r of [-1, Infinity, NaN])
    expect(() => hash.queryRadius({ x: 0, z: 0 }, r)).toThrow(RangeError);
  expect(() => hash.queryBox({ x: 1, z: 0 }, { x: 0, z: 1 })).toThrow(
    RangeError,
  );
  expect(() => hash.queryBox({ x: 0, z: 1 }, { x: 1, z: 0 })).toThrow(
    RangeError,
  );
  expect(() => hash.queryRadius({ x: NaN, z: 0 }, 1)).toThrow(RangeError);
});
