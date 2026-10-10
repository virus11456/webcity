/** Terrain-only hit. Cell and tile coordinates are zero-based, row-major. */
export interface TerrainPick {
  world: { x: number; y: number; z: number };
  cell: { x: number; z: number; index: number };
  tile: { x: number; z: number; index: number };
  owned: boolean;
  distance: number;
}
