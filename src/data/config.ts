// World/time: GDD §1–2; quality: ART §12. Distances are metres.
export const CELL_SIZE = 8 as const;
export const TILE_CELLS = 120 as const;
export const MAP_TILES = 5 as const;
export const SEA_LEVEL = 40 as const;
export const TILE_SIZE = CELL_SIZE * TILE_CELLS;
export const MAP_CELLS = TILE_CELLS * MAP_TILES;
export const MAP_SIZE = CELL_SIZE * MAP_CELLS;
export const WORLD = {
  startTile: [2, 2],
  startOwnedTiles: 1,
  maxOwnedTiles: {
    desktop: 9,
    ipad: 9,
    iphone: 4,
  },
  heightmapSpacingM: 16,
  heightmapVertices: 301,
  heightRangeM: [0, 400],
  fieldSpacingM: 16,
  fieldCells: 300,
} as const;
export const TERRAIN_GENERATION = {
  octaves: 4,
  frequencyPerM: 0.0008333333333333334,
  minCentralFlatFraction: 0.7,
  centralMaxSlopeExclusive: 0.1,
  centralHeightAboveSeaM: [5, 30],
  riverWidthM: [40, 120],
  riverDepthBelowSeaM: [4, 8],
  resourceRange: [0, 255],
  oilClusters: [2, 4],
  minHighwayEntrances: 2,
  presetCount: 3,
} as const;
export const TIME = {
  startDate: '2026-01-01',
  secondsPerDay: {
    1: 2.4,
    2: 1.2,
    4: 0.6,
  },
  ticksPerDay: 10,
  fiscalPeriodDays: 7,
  dayNightSecondsAtNormalSpeed: 360,
} as const;
export type SimSpeed = 0 | keyof typeof TIME.secondsPerDay;
export const QUALITY = {
  low: {
    resolutionScale: 0.75,
    maxDpr: 1.5,
    shadowMapSize: 0,
    cascadedShadows: false,
    postprocessing: [],
    maxVehicles: 300,
    treeDensity: 0.5,
    lodMultiplier: 0.6,
  },
  medium: {
    resolutionScale: 1,
    maxDpr: 2,
    shadowMapSize: 1024,
    cascadedShadows: false,
    postprocessing: ['tiltShift', 'bloom', 'fxaa'],
    maxVehicles: 1000,
    treeDensity: 1,
    lodMultiplier: 1,
  },
  high: {
    resolutionScale: 1,
    maxDpr: 2,
    shadowMapSize: 2048,
    cascadedShadows: true,
    postprocessing: ['tiltShift', 'ssao', 'bloom', 'fxaa'],
    maxVehicles: 3000,
    treeDensity: 1,
    lodMultiplier: 1.3,
  },
} as const;
export const QUALITY_DETECTION = {
  sampleSeconds: 5,
  lowFpsThreshold: 30,
  sustainedSeconds: 10,
  slowWindows: 2,
} as const;
export const UI_RULES = {
  maxNotifications: 3,
  notificationSeconds: 5,
  undoActions: 10,
  scaleRange: [0.9, 1.3],
} as const;
export const SAVE = {
  autosaveRealSeconds: 300,
  manualSlots: 10,
} as const;
export const TUTORIAL = {
  minRoads: 3,
  completionReward: 5000,
} as const;
export const GAME_MODES = {
  normal: {
    unlimitedMoney: false,
    allUnlocked: false,
    demandBonus: 0,
  },
  easy: {
    unlimitedMoney: false,
    allUnlocked: false,
    demandBonus: 10,
  },
  sandbox: {
    unlimitedMoney: true,
    allUnlocked: true,
    demandBonus: 0,
  },
} as const;
export type WorldConfig = typeof WORLD;
export type QualityLevel = keyof typeof QUALITY;
export type QualityConfig = (typeof QUALITY)[QualityLevel];
export type GameMode = keyof typeof GAME_MODES;

export interface GraphicsOptions {
  shadows: boolean;
  postprocessing: boolean;
  tiltShift: boolean;
  treeDensity: number;
}
export const GRAPHICS_DEFAULTS: GraphicsOptions = {
  shadows: true,
  postprocessing: true,
  tiltShift: true,
  treeDensity: 100,
};
