/** Diagnostic sampling and bounded derived caches; never change simulation progression. */
export const PERFORMANCE = {
  samples: 240,
  parkFieldMaxBytes: 1024 * 1024,
  parkFieldMaxSources: 4096,
  reportMs: 1000,
  serviceRasterMaxBytes: 8 * 1024 * 1024,
  serviceRasterMaxRoads: 1024,
  serviceAccessBlockSegments: 16,
} as const;
