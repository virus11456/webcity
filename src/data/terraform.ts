export const TERRAFORM = {
  modes: ['raise', 'lower', 'flatten', 'river'],
  radii: [32, 64, 96],
  stepM: 4,
  riverDepthM: 8,
  maxPoints: 64,
  maxSamples: 512,
  maxVertices: 4096,
  ringSegments: 48,
} as const;
