import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
} from 'three';
import { DAY_NIGHT as D } from '../../data/dayNight';
import { DAY_NIGHT_PALETTE as P, ROAD_PALETTE } from '../../data/palette';
import { LightGlows } from '../lightGlows';
import { edge, type Arm } from './geometry';

/** Alternating roadside lamps with warm ground decals, rebuilt only with road geometry. */
export class Streetlights {
  readonly group = new Group();
  readonly count: number;
  private readonly poles;
  private readonly heads;
  private readonly halos;
  constructor(arms: Map<number, Arm[]>) {
    const positions: { x: number; y: number; z: number }[] = [];
    for (const [node, list] of arms)
      for (const a of list) {
        if (a.segment.start !== node || !a.segment.type.startsWith('road_'))
          continue;
        const b = arms
          .get(a.segment.end)!
          .find((b) => b.segment.id === a.segment.id)!;
        const end = a.samples[a.samples.length - 1]!.distance - b.trim;
        let side = 1;
        for (
          let d = a.trim + D.lampSpacingM / 2;
          d < end;
          d += D.lampSpacingM
        ) {
          positions.push(edge(a.samples, d, side * (a.width - 0.75), 0.25));
          side = -side;
        }
      }
    this.count = positions.length;
    this.poles = new InstancedMesh(
      new BoxGeometry(0.2, D.lampHeightM, 0.2),
      new MeshBasicMaterial({ color: ROAD_PALETTE.curb }),
      Math.max(1, this.count),
    );
    this.heads = new InstancedMesh(
      new BoxGeometry(1.2, 0.25, 0.5),
      new MeshBasicMaterial({ color: P.streetlight }),
      Math.max(1, this.count),
    );
    this.halos = new LightGlows(
      this.count,
      P.streetlight,
      D.lampRadiusM * 2,
      false,
      D.lampOpacity,
    );
    const matrix = new Matrix4();
    positions.forEach((p, i) => {
      this.poles.setMatrixAt(
        i,
        matrix.makeTranslation(p.x, p.y + D.lampHeightM / 2, p.z),
      );
      this.heads.setMatrixAt(
        i,
        matrix.makeTranslation(p.x, p.y + D.lampHeightM, p.z),
      );
      this.halos.mesh.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z));
    });
    for (const mesh of [this.poles, this.heads, this.halos.mesh]) {
      mesh.count = this.count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    this.setNight(0);
  }
  setNight(value: number): void {
    this.halos.setNight(value);
    this.heads.material.color
      .set(ROAD_PALETTE.lane_white)
      .lerpColors(
        this.heads.material.color,
        this.halos.mesh.material.uniforms.glowColor!.value,
        value,
      );
  }
  dispose(): void {
    this.group.removeFromParent();
    for (const mesh of [this.poles, this.heads]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
    this.halos.dispose();
    this.group.clear();
  }
}
