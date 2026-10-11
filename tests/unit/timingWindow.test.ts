import { expect, it } from 'vitest';
import { TimingWindow } from '../../src/core/timingWindow';
it('keeps a bounded rolling window with exact mean, nearest-rank p95 and maximum', () => {
  const t = new TimingWindow(20);
  expect(t.read()).toEqual({ count: 0, meanMs: 0, p95Ms: 0, maxMs: 0 });
  for (let i = 1; i <= 20; i++) t.record(i);
  expect(t.read()).toEqual({ count: 20, meanMs: 10.5, p95Ms: 19, maxMs: 20 });
  t.record(100);
  expect(t.read()).toEqual({ count: 20, meanMs: 15.45, p95Ms: 20, maxMs: 100 });
  for (const n of [-1, Infinity, NaN]) t.record(n);
  expect(t.read().count).toBe(20);
  const one = new TimingWindow(1);
  one.record(0);
  one.record(4);
  expect(one.read()).toEqual({ count: 1, meanMs: 4, p95Ms: 4, maxMs: 4 });
  for (const n of [0, -1, 1.5, NaN, Infinity])
    expect(() => new TimingWindow(n)).toThrow(RangeError);
});
