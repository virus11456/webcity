import { createHash } from 'node:crypto';
import { RoadGraph } from '../../src/world/roadGraph';
import { ServiceNetwork } from '../../src/world/services';

/** Provider application only, separate from demand and citizen allocation. */
export function measureServiceRaster() {
  const graph = new RoadGraph();
  for (let row = 0; row < 16; row++)
    graph.addRoad({
      start: { x: -1056, z: row * 128 - 960 },
      end: { x: 1056, z: row * 128 - 960 },
      type: 'road_large',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  const { nodes, segments } = graph.snapshot();
  for (const [i, road] of segments.entries())
    if (i % 2) {
      road.c1.z += 40;
      road.c2.z -= 40;
    }
  return [true, false].map((cache) => {
    const network = cache
      ? new ServiceNetwork(nodes, segments)
      : new ServiceNetwork(nodes, segments, 0);
    const providers = [...network.links.values()].flatMap((link) =>
      [0.2, 0.5, 0.8].map((fraction, i) => ({
        reach: network.reach(
          { road: link.segment.id, distance: link.length * fraction },
          [300, 600, 900][i]!,
        ),
        efficiency: [0.37, 1, 1.5][i]!,
      })),
    );
    const field = new Float32Array(300 * 300),
      samples: number[] = [],
      hashes: string[] = [];
    for (let run = 0; run < 7; run++) {
      field.fill(0);
      const start = performance.now();
      for (const p of providers)
        network.raster(p.reach, field, 300, p.efficiency);
      samples.push(performance.now() - start);
      hashes.push(
        createHash('sha256').update(new Uint8Array(field.buffer)).digest('hex'),
      );
    }
    return {
      cache,
      providers: providers.length,
      size: 300,
      samples,
      firstMs: samples[0],
      meanMs: samples.slice(2).reduce((a, b) => a + b, 0) / 5,
      cachedBytes: network.cachedRasterBytes,
      hashes,
      note: '48 providers on 16 disconnected straight/curved roads; grid 300x300. Seven passes, first retained, mean of passes 3–7. Cache enabled and zero-budget fallback separate. Excludes construction, reach, reset and hashes. No buildings, allocation or browser IPC.',
    };
  });
}
