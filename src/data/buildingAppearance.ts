// ART §3.1 / §7.1. Appearance only: these values never change capacities or simulation time.
export const BUILDING_FORM = {
  floors: {
    RL: [
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
      [3, 3],
    ],
    RH: [
      [4, 6],
      [6, 10],
      [8, 14],
      [12, 20],
      [16, 30],
    ],
    CL: [
      [1, 1],
      [1, 2],
      [2, 3],
    ],
    CH: [
      [3, 6],
      [5, 12],
      [10, 20],
    ],
    I: [
      [1, 1],
      [1, 1],
      [1, 2],
    ],
    O: [
      [6, 12],
      [10, 24],
      [20, 45],
    ],
  },
  floorHeight: { RL: 3, RH: 3, CL: 4, CH: 4, I: 8, O: 4 },
  budgets: { RL: 600, RH: 1500, CL: 600, CH: 1500, I: 1500, O: 1500 },
  atlasSize: 1024,
  atlasCells: 8,
  windowVariants: 4,
  roofOverhang: 0.4,
  roofRise: 2,
  sideSetback: 0.8,
  frontSetback: 1.5,
  residentialFront: 3.5,
  chimneyHeight: [20, 40],
  cylinderSides: 8,
  construction: {
    foundationHeight: 0.25,
    framingEnd: 0.75,
    facadeStart: 0.55,
    scaffoldGap: 0.3,
    scaffoldFloor: 3,
    previewSeconds: 12,
    checkpoints: [0, 0.5, 0.9, 1],
  },
  gallery: { pageSize: 6, defaultSeed: 11456, maxDpr: 2, fitPadding: 1.22 },
} as const;
export const BUILDING_ZONES = ['RL', 'RH', 'CL', 'CH', 'I', 'O'] as const;
export interface BuildingSpec {
  zone: (typeof BUILDING_ZONES)[number];
  level: number;
  w: number;
  d: number;
  seed: number;
}

export interface BuildingVolume {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  floors: number;
}
