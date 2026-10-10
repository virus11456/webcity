import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineLoop,
} from 'three';
import { CELL_SIZE, MAP_SIZE } from '../../data/config';
import { PICKING } from '../../data/picking';
import { UI_PALETTE } from '../../data/palette';
import { meshHeightAt } from '../../world/heightField';
import type { Terrain } from '../../world/terrain';
import type { TerrainPick } from '../../world/picking';

/** Debug-only 8 m outline draped over terrain, with buffers reused for every pick. */
export class PickingMarker {
  private readonly positions = new Float32Array(
    ((4 * CELL_SIZE) / PICKING.markerStepM) * 3,
  );
  private readonly attribute = new Float32BufferAttribute(this.positions, 3);
  readonly line = new LineLoop(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: UI_PALETTE.text,
      depthTest: false,
      depthWrite: false,
    }),
  );
  constructor(private readonly terrain: Pick<Terrain, 'heights'>) {
    this.line.geometry.setAttribute('position', this.attribute);
    this.line.frustumCulled = false;
    this.line.renderOrder = 10;
    this.line.visible = false;
  }
  /** Move the outline to the picked cell; null clears the overlay. */
  update(hit: TerrainPick | null): void {
    this.line.visible = hit !== null;
    if (!hit) return;
    const x0 = hit.cell.x * CELL_SIZE - MAP_SIZE / 2,
      z0 = hit.cell.z * CELL_SIZE - MAP_SIZE / 2;
    let k = 0;
    for (let edge = 0; edge < 4; edge++)
      for (let d = 0; d < CELL_SIZE; d += PICKING.markerStepM) {
        const x =
          x0 +
          (edge === 0
            ? d
            : edge === 1
              ? CELL_SIZE
              : edge === 2
                ? CELL_SIZE - d
                : 0);
        const z =
          z0 +
          (edge === 0
            ? 0
            : edge === 1
              ? d
              : edge === 2
                ? CELL_SIZE
                : CELL_SIZE - d);
        this.attribute.setXYZ(
          k++,
          x,
          meshHeightAt(this.terrain.heights, x, z) + PICKING.markerLiftM,
          z,
        );
      }
    this.attribute.needsUpdate = true;
  }
  /** Release the marker's GPU buffers and material. */
  dispose(): void {
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
