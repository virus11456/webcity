/** Original preset seeds and MVP terrain tuning (metres), GDD §1.2. */
export const MAP_PRESETS = [
  { id: 'valley', seed: 20261006, relief: 1, coast: false },
  { id: 'bay', seed: 731291, relief: 0.7, coast: true },
  { id: 'mountains', seed: 982451, relief: 1.5, coast: false },
] as const;
export const TERRAIN = {
  baseHeight: 58,
  centralNoise: 1.5,
  centralRadius: 560,
  transitionWidth: 800,
  relief: 110,
  ridgeHeight: 220,
  riverOffset: 340,
  riverAmplitude: 110,
  riverWavelength: 700,
  bankWidth: 32,
  valleyWidth: 320,
  coastWidth: 550,
  chunkCells: 64,
  lowSaturation: 0.4,
  lowBrightness: 0.85,
  rockSlope: 0.35,
  dirtSlope: 0.2,
  dryHeight: 200,
  shoreHeight: 3,
  boundaryLift: 0.6,
  boundaryDash: 12,
  boundaryGap: 10,
  noisePersistence: 0.5,
  noiseLacunarity: 2,
  ridgeScale: 750,
  flatScale: 450,
  reliefBias: 0.4,
  coastDepth: 12,
  riverBedDepth: 4,
  riverBedDrop: 4,
  oilRadius: [180, 400],
  fertileSlope: 0.2,
  fertileDistance: 1200,
  forestScale: 250,
  oreHeight: 110,
  oreHeightRange: 180,
} as const;
/** Display-only city composition, not simulation state or a saved city. */
export const CITY_PREVIEW = {
  seed: 81724,
  streetX: [-440, -320, -200, -80, 40, 160, 280],
  streetZ: [-360, -240, -120, 0, 120, 240, 360],
  streetWidth: 16,
  sidewalkWidth: 22,
  buildingStep: 36,
  treeCount: 650,
  initial: {
    x: -60,
    z: 0,
    distance: 1450,
    azimuth: Math.PI / 4,
    elevation: Math.PI / 3.5,
  },
  views: {
    center: { x: -60, z: -40, distance: 950 },
    river: { x: 330, z: 50, distance: 1000 },
    overview: { x: 0, z: 0, distance: 2400 },
  },
} as const;
export type CityView = keyof typeof CITY_PREVIEW.views;

/** ART §5.1: four packed 512² detail maps and two world-space variation scales. */
export const TERRAIN_DETAIL = {
  size: 512,
  seed: 32002,
  repeatM: 8,
  contrast: 0.32,
  nearFadeM: 100,
  farFadeM: 850,
  variationSmallM: 32,
  variationLargeM: 256,
  variationSmall: 0.08,
  variationLarge: 0.16,
  triplanarSharpness: 4,
} as const;

export interface TerrainPreset {
  relief: number;
  coast: boolean;
}
export const MAP_SELECTION = {
  randomSalt: 417,
  relief: [0.7, 1.5] as const,
  coastChance: 0.35,
  previewSize: 240,
  previewDelayMs: 120,
  mountainHeight: 180,
  hillHeight: 100,
  tileLineWidth: 2,
} as const;
