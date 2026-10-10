import { expect, it } from 'vitest';
import { ROAD_DETAIL as D } from '../../src/data/roadDetail';
import { roadDetailPixels } from '../../src/world/roadDetail';
it('produces deterministic packed asphalt and repeating staggered paving with opaque pixels', () => {
  const a = roadDetailPixels(),
    b = roadDetailPixels();
  expect(a).toEqual(b);
  expect(a.length).toBe(D.size * D.size * 4);
  let low = 255,
    high = 0;
  for (let i = 0; i < a.length; i += 4) {
    low = Math.min(low, a[i]!);
    high = Math.max(high, a[i]!);
    expect(a[i + 3]).toBe(255);
  }
  expect(low).toBe(0);
  expect(high).toBe(255);
  const at = (x: number, y: number) => a[(y * D.size + x) * 4 + 1]!;
  // Mortar repeats every half metre; alternate rows offset by a quarter metre.
  expect(at(0, 32)).toBe(20);
  expect(at(64, 32)).toBe(20);
  expect(at(0, 96)).toBeGreaterThan(150);
  expect(at(32, 96)).toBe(20);
  expect(at(0, 32)).toBe(at(D.size - 1, 32));
  expect(at(32, 0)).toBe(at(32, D.size - 1));
});
