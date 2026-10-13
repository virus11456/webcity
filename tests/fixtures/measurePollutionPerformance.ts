import { createHash } from 'node:crypto';
import { diffusePollution } from '../../src/sim/systems/fields';

export function measurePollutionPerformance() {
  const size = 300,
    steps = 20;
  const initial = Float32Array.from(
    { length: size * size },
    (_, i) => ((i * 137) % 10007) / 101,
  );
  const emissions = Float32Array.from(initial, (_, i) => (i % 17) / 13);
  const samples: number[] = [],
    hashes: string[] = [];
  for (let run = 0; run < 7; run++) {
    let source: Float32Array = initial.slice();
    const start = performance.now();
    for (let step = 0; step < steps; step++)
      source = diffusePollution(source, size, emissions);
    samples.push((performance.now() - start) / steps);
    hashes.push(
      createHash('sha256').update(new Uint8Array(source.buffer)).digest('hex'),
    );
  }
  return {
    size,
    steps,
    samples,
    meanMs: samples.slice(2).reduce((a, b) => a + b, 0) / 5,
    resultSha256: hashes[0],
    note: 'Seven runs of twenty evolving field updates; time per update, runs 3–7 mean. Deterministic fractional emissions, kernel only; excludes other simulation and browser work.',
    hashes,
  };
}
