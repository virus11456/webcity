// Visual budgets and ART §9 animation times; never advance simulation state.
export const BUILDING_RENDER = {
  initialCapacity: 8,
  workBudgetMs: 2,
  operationsPerFrame: 24,
  detailDistance: 450,
  detailLimit: 16,
  constructionDetailLimit: 4,
  lodInterval: 0.2,
  placementSeconds: 0.25,
  demolitionSeconds: 0.4,
  progressBlendSeconds: 0.24,
  dustSeconds: 0.55,
  dustParticles: 6,
  dustLimit: 96,
  demoCount: 5000,
  demoSpacing: 48,
} as const;

export const GROWTH_VIEW_DISTANCE = 220;

export const BUILDING_LOD = {
  nearM: 250,
  farM: 900,
  hysteresisM: 20,
  transitionSeconds: 0.3,
  operationsPerFrame: 8,
  workBudgetMs: 2,
} as const;
