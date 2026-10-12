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
