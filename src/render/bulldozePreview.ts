import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  type Scene,
} from 'three';
import { BULLDOZE } from '../data/bulldoze';
import { UI_PALETTE } from '../data/palette';
import { meshHeightAt } from '../world/heightField';
import type { BulldozeShape } from '../world/bulldozeSelection';
import type { Vec2 } from '../world/types';

/** Red terrain-following footprint, rebuilt only when the selected IDs or world change. */
export class BulldozePreview {
  private readonly material = new MeshBasicMaterial({
    color: UI_PALETTE.negative,
    transparent: true,
    opacity: BULLDOZE.overlayOpacity,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  });
  private readonly mesh = new Mesh(new BufferGeometry(), this.material);
  private key = '';
  private heights: Float32Array | undefined;
  constructor(scene: Scene) {
    scene.add(this.mesh);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }
  show(
    shapes: readonly BulldozeShape[],
    heights: Float32Array | undefined,
  ): void {
    this.mesh.visible = shapes.length > 0 && Boolean(heights);
    const key = shapes.map((s) => `${s.target.kind}:${s.target.id}`).join(',');
    if (key === this.key && heights === this.heights) return;
    this.key = key;
    this.heights = heights;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new BufferGeometry();
    if (!heights || !shapes.length) return;
    const points: number[] = [];
    const vertex = (p: Vec2) =>
      points.push(
        p.x,
        meshHeightAt(heights, p.x, p.z) + BULLDOZE.overlayLiftM,
        p.z,
      );
    const quad = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
      for (const p of [a, b, c, a, c, d]) vertex(p);
    };
    for (const shape of shapes) {
      if (shape.closed) {
        quad(
          shape.points[0]!,
          shape.points[1]!,
          shape.points[2]!,
          shape.points[3]!,
        );
        continue;
      }
      for (let i = 1; i < shape.points.length; i++) {
        const a = shape.points[i - 1]!,
          b = shape.points[i]!,
          dx = b.x - a.x,
          dz = b.z - a.z,
          length = Math.hypot(dx, dz);
        if (!length) continue;
        const nx = ((-dz / length) * shape.width) / 2,
          nz = ((dx / length) * shape.width) / 2;
        quad(
          { x: a.x + nx, z: a.z + nz },
          { x: a.x - nx, z: a.z - nz },
          { x: b.x - nx, z: b.z - nz },
          { x: b.x + nx, z: b.z + nz },
        );
      }
    }
    this.mesh.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(points, 3),
    );
    this.mesh.geometry.computeBoundingSphere();
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
