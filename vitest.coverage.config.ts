import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config.ts';

/** Measure the existing core coverage gate without profiling simulation budgets. */
export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    include: [
      'tests/unit/{assetManifest,events,grid,math,rng,spatial,timingWindow}.test.ts',
    ],
  },
});
