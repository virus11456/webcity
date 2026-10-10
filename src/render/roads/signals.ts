import {
  Group,
  Mesh,
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Float32BufferAttribute,
  Color,
  Matrix4,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_PALETTE as P } from '../../data/palette';
import { INTERSECTIONS as C } from '../../data/intersections';
import { ROAD_RULES, ROADS } from '../../data/roads';
import { greenGroup, signalGroups } from '../../world/intersections';
import type { RoadConstructionWorld } from '../../world/roadConstruction';
import { edge, type Arm } from './geometry';
/** One static furniture mesh plus one instanced lamp mesh; colors update only at phase boundaries. */
export class IntersectionProps {
  readonly group = new Group();
  readonly count: number;
  private lamps: InstancedMesh | undefined;
  private phase = -1;
  private colors = {
    red: new Color(P.signal_red),
    green: new Color(P.signal_green),
    off: new Color(P.signal_off),
  };
  private approaches: { segment: number; groups: number[][]; index: number }[] =
    [];
  constructor(world: RoadConstructionWorld, arms: Map<number, Arm[]>) {
    const parts: BufferGeometry[] = [],
      lamps: { x: number; y: number; z: number }[] = [];
    const add = (
      geometry: BufferGeometry,
      x: number,
      y: number,
      z: number,
      rotation: number,
      color: string,
    ) => {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      if (g !== geometry) geometry.dispose();
      g.rotateY(rotation);
      g.translate(x, y, z);
      g.deleteAttribute('uv');
      const c = new Color(color),
        colors = new Float32Array(g.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = c.r;
        colors[i + 1] = c.g;
        colors[i + 2] = c.b;
      }
      g.setAttribute('color', new Float32BufferAttribute(colors, 3));
      parts.push(g);
    };
    let count = 0;
    for (const node of world.nodes) {
      const list = arms.get(node.id) ?? [];
      if (list.length < 3 || node.control === 'none') continue;
      const groups = signalGroups(node, world.segments, world.nodes);
      for (const arm of list) {
        const s = arm.segment;
        if (
          (s.end === node.id
            ? ROADS[s.type].lanesForward
            : ROADS[s.type].lanesBackward) === 0
        )
          continue;
        const p = edge(
            arm.samples,
            arm.trim + C.stopLineOffsetM,
            -arm.width + arm.walk / 2,
          ),
          angle = Math.PI / 2 - arm.angle;
        const height = node.control === 'stop' ? C.stopHeightM : C.poleHeightM;
        add(
          new CylinderGeometry(C.poleRadiusM, C.poleRadiusM, height, 6),
          p.x,
          p.y + height / 2,
          p.z,
          0,
          P.curb,
        );
        if (node.control === 'stop') {
          const board = new CylinderGeometry(
            C.stopRadiusM,
            C.stopRadiusM,
            C.housingDepthM,
            8,
          );
          board.rotateX(Math.PI / 2);
          add(board, p.x, p.y + height, p.z, angle, P.signal_red);
          add(
            new BoxGeometry(
              C.stopRadiusM,
              C.stripeWidthM / 2,
              C.housingDepthM * 2,
            ),
            p.x,
            p.y + height,
            p.z,
            angle,
            P.lane_white,
          );
        } else {
          add(
            new BoxGeometry(C.housingWidthM, C.housingHeightM, C.housingDepthM),
            p.x,
            p.y + height - C.housingHeightM / 2,
            p.z,
            angle,
            P.signal_off,
          );
          const x = p.x + Math.cos(arm.angle) * C.housingDepthM,
            z = p.z + Math.sin(arm.angle) * C.housingDepthM;
          this.approaches.push({ segment: s.id, groups, index: lamps.length });
          lamps.push(
            { x, y: p.y + height - C.housingHeightM / 4, z },
            { x, y: p.y + height - (C.housingHeightM * 3) / 4, z },
          );
        }
        count++;
      }
    }
    this.count = count;
    if (parts.length) {
      const geometry = mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
      );
      mesh.castShadow = true;
      this.group.add(mesh);
    }
    if (lamps.length) {
      this.lamps = new InstancedMesh(
        new SphereGeometry(C.bulbRadiusM, 6, 4),
        new MeshBasicMaterial(),
        lamps.length,
      );
      const m = new Matrix4();
      lamps.forEach((p, i) => {
        m.makeTranslation(p.x, p.y, p.z);
        this.lamps!.setMatrixAt(i, m);
      });
      this.lamps.instanceMatrix.needsUpdate = true;
      this.lamps.computeBoundingSphere();
      this.group.add(this.lamps);
      this.update(0);
    }
  }
  update(seconds: number): void {
    const phase = Math.floor(
      Math.max(0, seconds) / ROAD_RULES.greenLightGameSeconds,
    );
    if (phase === this.phase || !this.lamps) return;
    this.phase = phase;
    for (const a of this.approaches) {
      const green = greenGroup(a.groups, seconds).includes(a.segment);
      this.lamps.setColorAt(a.index, green ? this.colors.off : this.colors.red);
      this.lamps.setColorAt(
        a.index + 1,
        green ? this.colors.green : this.colors.off,
      );
    }
    this.lamps.instanceColor!.needsUpdate = true;
  }
  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.group.clear();
  }
}
