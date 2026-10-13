import { expect, it } from 'vitest';
import { diffusePollution } from '../../src/sim/systems/fields';
import { ENVIRONMENT as E } from '../../src/data/environment';

// Original border-reflection algorithm, retained as an independent reference.
function reference(
  source: Float32Array,
  size: number,
  emissions: Float32Array,
) {
  const next = new Float32Array(source.length);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      let neighbors = 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          neighbors +=
            source[
              z + dz < 0 || z + dz >= size || x + dx < 0 || x + dx >= size
                ? i
                : (z + dz) * size + x + dx
            ]!;
        }
      next[i] = Math.max(
        0,
        Math.min(
          E.maxValue,
          (source[i]! * (1 - E.diffusion) +
            (neighbors * E.diffusion) / 8 +
            emissions[i]!) *
            (1 - E.decay),
        ),
      );
    }
  return next;
}
it.each([1, 2, 3, 17, 300])(
  'preserves every Float32 cell over repeated diffusion on a %i-wide grid',
  (size) => {
    let actual: Float32Array = Float32Array.from(
      { length: size * size },
      (_, i) => ((i * 137) % 10007) / 101,
    );
    let expected = actual.slice();
    const emissions = Float32Array.from(actual, (_, i) =>
      i % 7 === 0 ? 150.125 : (i % 11) / 13,
    );
    const saved = emissions.slice();
    for (let step = 0; step < 4; step++) {
      const before = actual.slice();
      const next = diffusePollution(actual, size, emissions);
      expect(actual).toEqual(before);
      expected = reference(expected, size, emissions);
      actual = next;
      expect(actual).toEqual(expected);
    }
    expect(emissions).toEqual(saved);
    expect(diffusePollution(actual, size)).toEqual(
      reference(actual, size, new Float32Array(actual.length)),
    );
  },
);

it('preserves reflected mass for a source at every corner, edge and interior cell', () => {
  const size = 9;
  for (let index = 0; index < size * size; index++) {
    const source = new Float32Array(size * size);
    source[index] = 80;
    const emissions = new Float32Array(source.length);
    const next = diffusePollution(source, size, emissions);
    expect(next).toEqual(reference(source, size, emissions));
    expect(next.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      80 * (1 - E.decay),
      5,
    );
  }
});

it('reads offset views without changing backing buffers and returns independent storage', () => {
  const size = 7;
  const backing = Float32Array.from({ length: 100 }, (_, i) => i / 7);
  const source = backing.subarray(5, 54);
  const emissions = backing.subarray(20, 69);
  const before = backing.slice();
  const expected = reference(source, size, emissions);
  const next = diffusePollution(source, size, emissions);
  expect(next).toEqual(expected);
  expect(backing).toEqual(before);
  next.fill(0);
  expect(backing).toEqual(before);
  expect(diffusePollution(new Float32Array(), 0)).toEqual(new Float32Array());
});
