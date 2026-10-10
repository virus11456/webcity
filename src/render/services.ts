import {
  BoxGeometry,
  DoubleSide,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  Quaternion,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SimEvent } from '../bridge/protocol';
import { BUILDING_PALETTE, SERVICE_PALETTE, UI_PALETTE } from '../data/palette';
import { serviceDefinition, type ServicePreview } from '../world/services';
import type { Building, Vec2 } from '../world/types';
/** Original civic buildings, merged by material; rebuilt on structural changes only. */
export class ServiceRenderer {
  readonly group = new Group();
  private assets = new Group();
  private buildings = new Map<number, Building>();
  private preview = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({
      color: UI_PALETTE.positive,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  private materials = new Map<string, MeshStandardMaterial>();
  constructor(
    scene: Scene,
    private height: (x: number, z: number) => number,
  ) {
    scene.add(this.group);
    this.group.add(this.assets, this.preview);
    this.preview.renderOrder = 4;
  }
  private clear() {
    this.assets.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.assets.clear();
  }
  private rebuild() {
    this.clear();
    const batches = new Map<string, BufferGeometry[]>();
    for (const b of this.buildings.values()) {
      const def = serviceDefinition(b.defId);
      if (!def) continue;
      const color =
        b.enabled === false
          ? SERVICE_PALETTE.power
          : SERVICE_PALETTE[def.service as keyof typeof SERVICE_PALETTE];
      const w = b.lotW * 8,
        d = b.lotD * 8,
        h = b.lotW >= 6 ? 18 : 9;
      const rotation = new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0),
        b.rotation,
      );
      const base = new Matrix4().compose(
        new Vector3(b.pos.x, this.height(b.pos.x, b.pos.z), b.pos.z),
        rotation,
        new Vector3(1, 1, 1),
      );
      const box = (
        width: number,
        height: number,
        depth: number,
        x: number,
        y: number,
        z: number,
        paint: string,
      ) => {
        const g = new BoxGeometry(width, height, depth);
        g.translate(x, y, z);
        g.applyMatrix4(base);
        const list = batches.get(paint) ?? [];
        list.push(g);
        batches.set(paint, list);
      };
      const dark = BUILDING_PALETTE.industrial.roofs[0],
        pale = BUILDING_PALETTE.RL.accents[0];
      box(w, 0.5, d, 0, 0.25, d / 2, SERVICE_PALETTE.power);
      box(w * 0.82, h, d * 0.65, 0, h / 2, d * 0.57, color);
      box(w * 0.86, 0.8, d * 0.69, 0, h + 0.4, d * 0.57, dark);
      // Tall sign, entrance canopy and a repeated glass band distinguish civic facilities.
      box(w * 0.36, 0.5, 4, 0, 4.2, d * 0.19, pale);
      box(w * 0.15, 4, 0.3, 0, 2, d * 0.244, dark);
      for (let x = -w * 0.32; x <= w * 0.32; x += 5)
        box(2.8, 2, 0.25, x, h * 0.67, d * 0.24, dark);
      if (def.service === 'health') {
        box(1, 4, 0.4, w * 0.29, h * 0.68, d * 0.238, UI_PALETTE.negative);
        box(3, 1, 0.4, w * 0.29, h * 0.68, d * 0.237, UI_PALETTE.negative);
      }
      if (def.service === 'fire')
        for (const x of [-w * 0.25, 0, w * 0.25])
          box(w * 0.18, 4, 0.4, x, 2, d * 0.23, dark);
      if (def.service === 'police')
        box(2, 2, 0.5, w * 0.27, h * 0.68, d * 0.235, pale);
      if (def.service === 'education')
        box(w * 0.5, 1.5, d * 0.22, 0, 0.8, d * 0.1, UI_PALETTE.positive);
    }
    for (const [color, parts] of batches) {
      let material = this.materials.get(color);
      if (!material) {
        material = new MeshStandardMaterial({ color, roughness: 0.85 });
        this.materials.set(color, material);
      }
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      if (geometry) {
        const m = new Mesh(geometry, material);
        m.castShadow = m.receiveShadow = true;
        this.assets.add(m);
      }
    }
  }
  accept(e: SimEvent) {
    if (e.t === 'ready') {
      this.buildings = new Map(
        e.snapshot.buildings
          .filter((b) => serviceDefinition(b.defId))
          .map((b) => [b.id, b]),
      );
      this.rebuild();
    }
    if (e.t === 'buildingsChanged') {
      let changed = false;
      for (const id of e.removed)
        changed = this.buildings.delete(id) || changed;
      for (const b of e.added)
        if (serviceDefinition(b.defId)) {
          this.buildings.set(b.id, b);
          changed = true;
        }
      for (const p of e.updated) {
        const b = this.buildings.get(p.id);
        if (b) {
          Object.assign(b, p);
          if (p.enabled !== undefined || p.state !== undefined) changed = true;
        }
      }
      if (changed) this.rebuild();
    }
    if (e.t === 'roadsChanged' && e.terrain) this.rebuild();
  }
  show(p: ServicePreview | null) {
    this.preview.geometry.dispose();
    this.preview.geometry = new BufferGeometry();
    this.preview.visible = !!p;
    if (!p) return;
    this.preview.material.color.set(
      p.valid ? UI_PALETTE.positive : UI_PALETTE.negative,
    );
    const v: number[] = [];
    const add = (point: Vec2) =>
      v.push(point.x, this.height(point.x, point.z) + 0.4, point.z);
    const ribbon = (line: Vec2[], closed: boolean, width: number) => {
      for (let i = 0; i < line.length - (closed ? 0 : 1); i++) {
        const a = line[i]!,
          b = line[(i + 1) % line.length]!,
          l = Math.hypot(b.x - a.x, b.z - a.z);
        if (!l) continue;
        const nx = ((-(b.z - a.z) / l) * width) / 2,
          nz = (((b.x - a.x) / l) * width) / 2;
        const q = [
          { x: a.x + nx, z: a.z + nz },
          { x: b.x + nx, z: b.z + nz },
          { x: b.x - nx, z: b.z - nz },
          { x: a.x - nx, z: a.z - nz },
        ];
        for (const i of [0, 1, 2, 0, 2, 3]) add(q[i]!);
      }
    };
    for (const road of p.roads) ribbon(road, false, 3);
    ribbon(p.points, true, 1);
    this.preview.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(v, 3),
    );
    this.preview.geometry.computeBoundingSphere();
  }
  dispose() {
    this.clear();
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.group.removeFromParent();
  }
}
