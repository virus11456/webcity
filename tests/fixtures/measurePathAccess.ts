import { createHash } from 'node:crypto';
import { pathAccessFixture } from './pathAccess';
export function measurePathAccess() {
  return [80, 2048].map((length) => {
    const fixture = pathAccessFixture(length);
    const cold: number[] = [],
      warm: number[] = [],
      setup: number[] = [],
      hashes: string[] = [];
    for (let run = 0; run < 7; run++) {
      const startSetup = performance.now(),
        paths = fixture.createPaths();
      setup.push(performance.now() - startSetup);
      for (const samples of [cold, warm]) {
        const results = [],
          start = performance.now();
        for (const mode of ['drive', 'walk'] as const)
          for (const q of fixture.queries)
            results.push(paths.access(q.point, mode, q.setback));
        samples.push(performance.now() - start);
        hashes.push(
          createHash('sha256').update(JSON.stringify(results)).digest('hex'),
        );
      }
    }
    const mean = (v: number[]) => v.slice(2).reduce((a, b) => a + b, 0) / 5;
    return {
      length,
      queries: fixture.queries.length * 2,
      cold,
      warm,
      setup,
      coldMeanMs: mean(cold),
      warmMeanMs: mean(warm),
      setupMeanMs: mean(setup),
      hashes,
      note: '16 disconnected mixed roads; 2048 drive/walk frontage queries. Seven runs; mean of runs 3–7. Cold uses fresh Pathfinder, warm repeats identical cached queries. Setup excludes LaneGraph construction. Hashing excluded; no A* or browser IPC.',
    };
  });
}
