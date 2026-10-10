import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../../src/core/rng';

describe('mulberry32 deterministic random stream', () => {
  it('matches a known mulberry32 sequence for seed 1', () => {
    const rng = new Rng(1);
    expect(Array.from({ length: 5 }, () => rng.next())).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
      0.9810509674716741, 0.9683778982143849,
    ]);
  });
  it('replays all operations and wraps seeds consistently', () => {
    const run = (rng: Rng) =>
      Array.from({ length: 100 }, () => [
        rng.next(),
        rng.float(-10, 20),
        rng.int(-7, 12),
        rng.pick(['a', 'b', 'c']),
        rng.shuffle([1, 2, 3, 4]),
      ]);
    expect(run(new Rng(42))).toEqual(run(new Rng(42)));
    expect(run(new Rng(-1))).toEqual(run(new Rng(0xffff_ffff)));
    expect(run(new Rng(42))).not.toEqual(run(new Rng(43)));
    expect(new Rng(0).next()).not.toBe(new Rng(1).next());
  });
  it.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid seed %s',
    (seed) => expect(() => new Rng(seed)).toThrow(RangeError),
  );
  it('respects inclusive integer ranges and float ranges', () => {
    const rng = new Rng(24),
      seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(-2, 2);
      seen.add(value);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
      expect(rng.float()).toBeGreaterThanOrEqual(0);
      expect(rng.float()).toBeLessThan(1);
      const f = rng.float(-4, -2);
      expect(f).toBeGreaterThanOrEqual(-4);
      expect(f).toBeLessThan(-2);
    }
    expect([...seen].sort()).toEqual([-1, -2, 0, 1, 2]);
    expect(rng.int(3, 3)).toBe(3);
    expect(rng.float(3, 3)).toBe(3);
    expect(rng.int(0, 0xffff_ffff)).toBeGreaterThanOrEqual(0);
  });
  it('rejects the incomplete integer bin before producing an unbiased result', () => {
    const rng = new Rng(0);
    vi.spyOn(rng, 'next')
      .mockReturnValueOnce(0xffff_ffff / 0x1_0000_0000)
      .mockReturnValueOnce(1 / 0x1_0000_0000);
    expect(rng.int(0, 2)).toBe(1);
    expect(rng.next).toHaveBeenCalledTimes(2);
  });
  it.each([
    [2, 1],
    [0.5, 2],
    [0, Infinity],
    [NaN, 1],
    [0, 0x1_0000_0000],
  ])('rejects invalid int range %s…%s', (min, max) =>
    expect(() => new Rng(1).int(min, max)).toThrow(RangeError),
  );
  it.each([
    [2, 1],
    [0, Infinity],
    [NaN, 1],
    [-Number.MAX_VALUE, Number.MAX_VALUE],
  ])('rejects invalid float range %s…%s', (min, max) =>
    expect(() => new Rng(1).float(min, max)).toThrow(RangeError),
  );
  it('picks and shuffles without mutation or losing duplicates', () => {
    const rng = new Rng(0),
      input = [1, 2, 2, 3];
    expect(input).toContain(rng.pick(input));
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(rng.pick([undefined])).toBeUndefined();
    const shuffled = rng.shuffle(input);
    expect(shuffled).not.toBe(input);
    expect(shuffled.toSorted()).toEqual(input);
    expect(input).toEqual([1, 2, 2, 3]);
    expect(rng.shuffle([])).toEqual([]);
    expect(rng.shuffle([1])).toEqual([1]);
  });
});

it('keeps the float upper bound exclusive even when arithmetic rounds up', () => {
  const rng = new Rng(1);
  vi.spyOn(rng, 'next').mockReturnValue(1 - 2 ** -32);
  expect(rng.float(1, 1 + Number.EPSILON)).toBe(1);
});
