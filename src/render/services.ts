import type { FacilityAssets } from './facilities/assets';
import { facilityModel } from '../world/facilityModels';
import { PARKS } from '../data/parks';
import {
  BoxGeometry,
  ConeGeometry,
  InstancedMesh,
  Color,
  CylinderGeometry,
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
import {
  BUILDING_PALETTE,
  ROAD_PALETTE,
  ENVIRONMENT_PALETTE,
  SERVICE_PALETTE,
  UI_PALETTE,
  FIRE_PALETTE,
} from '../data/palette';
import { serviceDefinition, type ServicePreview } from '../world/services';
import { zoneBuildingFootprint } from '../world/zoneGeometry';
import type { Building, Vec2 } from '../world/types';
/** Original civic buildings, merged by material; rebuilt on structural changes only. */
export class ServiceRenderer {
  readonly group = new Group();
  private assets = new Group();
  private dirty = false;
  private catalogTree = false;
  private plantedTrees: InstancedMesh[] = [];
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
    private catalog?: FacilityAssets,
  ) {
    scene.add(this.group);
    this.group.add(this.assets, this.preview);
    this.preview.renderOrder = 4;
    const trunk = new CylinderGeometry(0.35, 0.55, 3, 6);
    trunk.translate(0, 1.5, 0);
    const lower = new ConeGeometry(2.8, 6, 7);
    lower.translate(0, 5, 0);
    const upper = new ConeGeometry(2, 4, 7);
    upper.translate(0, 7, 0);
    const leaves = mergeGeometries([lower, upper])!;
    lower.dispose();
    upper.dispose();
    for (const geometry of [trunk, leaves]) {
      const mesh = new InstancedMesh(
        geometry,
        new MeshStandardMaterial({ roughness: 0.85 }),
        PARKS.maxTrees,
      );
      mesh.count = 0;
      mesh.castShadow = mesh.receiveShadow = true;
      this.plantedTrees.push(mesh);
      this.group.add(mesh);
    }
  }
  private supports(id: string) {
    return (
      serviceDefinition(id) ||
      (this.catalog &&
        !id.startsWith('power_') &&
        !id.startsWith('water_') &&
        facilityModel(id))
    );
  }
  update() {
    if (this.dirty) {
      this.dirty = false;
      this.rebuild();
    }
  }
  private installTree() {
    if (!this.catalog || this.catalogTree) return;
    const tree = this.catalog.request(
      { defId: 'tree', lotW: 1, lotD: 1, state: 'active' },
      () => {
        this.dirty = true;
      },
    );
    if (!tree) return;
    tree.updateMatrixWorld(true);
    let mesh: Mesh | undefined;
    tree.traverse((o) => {
      if (o instanceof Mesh) mesh ??= o;
    });
    if (!mesh) return;
    const geometry = mesh.geometry.clone();
    for (const name of ['position', 'normal']) {
      const a = geometry.getAttribute(name),
        data = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        data[i * 3] = a.getX(i);
        data[i * 3 + 1] = a.getY(i);
        data[i * 3 + 2] = a.getZ(i);
      }
      geometry.setAttribute(name, new Float32BufferAttribute(data, 3));
    }
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.translate(0, 0, -4);
    for (const old of this.plantedTrees) {
      old.removeFromParent();
      old.geometry.dispose();
      (old.material as MeshStandardMaterial).dispose();
      old.dispose();
    }
    const instances = new InstancedMesh(
      geometry,
      mesh.material,
      PARKS.maxTrees,
    );
    instances.castShadow = instances.receiveShadow = true;
    instances.count = 0;
    this.plantedTrees = [instances];
    this.group.add(instances);
    this.catalogTree = true;
    tree.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  }
  private clear() {
    this.assets.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.assets.clear();
  }
  private rebuild() {
    this.clear();
    this.installTree();
    const batches = new Map<string, BufferGeometry[]>();
    const treeMatrix = new Matrix4(),
      treeColor = new Color();
    let treeCount = 0;
    for (const b of this.buildings.values())
      if (b.defId === 'tree' && treeCount < PARKS.maxTrees) {
        const x = b.pos.x + Math.sin(b.rotation) * 4,
          z = b.pos.z + Math.cos(b.rotation) * 4;
        treeMatrix.makeTranslation(x, this.height(x, z), z);
        for (let i = 0; i < this.plantedTrees.length; i++) {
          const mesh = this.plantedTrees[i]!;
          mesh.setMatrixAt(treeCount, treeMatrix);
          mesh.setColorAt(
            treeCount,
            treeColor.set(
              b.fire?.burning || b.state === 'burned'
                ? FIRE_PALETTE.char
                : this.catalogTree
                  ? BUILDING_PALETTE.RL.accents[0]
                  : i
                    ? ROAD_PALETTE.tree_leaf
                    : ROAD_PALETTE.tree_trunk,
            ),
          );
        }
        treeCount++;
      }
    for (const mesh of this.plantedTrees) {
      mesh.count = treeCount;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    for (const b of this.buildings.values()) {
      const def = serviceDefinition(b.defId);
      if (!this.supports(b.defId) || b.defId === 'tree') continue;
      const formal = this.catalog?.request(b, () => {
        this.dirty = true;
      });
      if (formal) {
        const placed = new Group();
        placed.position.set(b.pos.x, this.height(b.pos.x, b.pos.z), b.pos.z);
        placed.rotation.y = b.rotation;
        placed.add(formal);
        this.assets.add(placed);
        continue;
      }
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
        if (b.fire?.burning || b.state === 'burned') paint = FIRE_PALETTE.char;
        const list = batches.get(paint) ?? [];
        list.push(g);
        batches.set(paint, list);
      };
      if (def.kind === 'park') {
        const add = (
          g: BufferGeometry,
          paint: string,
          x: number,
          y: number,
          z: number,
        ) => {
          g.translate(x, y, z);
          g.applyMatrix4(base);
          if (b.fire?.burning || b.state === 'burned')
            paint = FIRE_PALETTE.char;
          const list = batches.get(paint) ?? [];
          list.push(g);
          batches.set(paint, list);
        };
        const tree = (x: number, z: number) => {
          add(
            new CylinderGeometry(0.35, 0.55, 3, 6),
            ROAD_PALETTE.tree_trunk,
            x,
            1.5,
            z,
          );
          add(new ConeGeometry(2.8, 6, 7), ROAD_PALETTE.tree_leaf, x, 5, z);
          add(new ConeGeometry(2, 4, 7), ROAD_PALETTE.tree_leaf, x, 7, z);
        };
        if (b.defId === 'tree') tree(0, d / 2);
        else {
          box(w, 0.2, d, 0, 0.1, d / 2, ROAD_PALETTE.median_grass);
          box(2, 0.24, d, 0, 0.12, d / 2, ROAD_PALETTE.sidewalk);
          box(w, 0.24, 2, 0, 0.12, d / 2, ROAD_PALETTE.sidewalk);
          for (const x of [-w * 0.3, w * 0.3])
            for (const z of [d * 0.2, d * 0.8]) tree(x, z);
          for (const x of [-w * 0.2, w * 0.2]) {
            box(3, 0.4, 1, x, 0.9, d * 0.4, ROAD_PALETTE.tree_trunk);
            box(0.4, 0.9, 0.6, x - 1, 0.45, d * 0.4, ROAD_PALETTE.concrete);
            box(0.4, 0.9, 0.6, x + 1, 0.45, d * 0.4, ROAD_PALETTE.concrete);
          }
          if (b.defId === 'park_playground') {
            box(3, 2, 3, w * 0.23, 1, d * 0.65, UI_PALETTE.positive);
            box(1, 1, 5, w * 0.23, 0.5, d * 0.47, ROAD_PALETTE.lane_yellow);
          } else if (b.defId === 'park_plaza') {
            box(
              w * 0.35,
              0.5,
              d * 0.35,
              0,
              0.25,
              d * 0.5,
              ROAD_PALETTE.concrete,
            );
            box(
              w * 0.28,
              0.52,
              d * 0.28,
              0,
              0.26,
              d * 0.5,
              ENVIRONMENT_PALETTE.water_shallow,
            );
          } else if (b.defId === 'park_large') {
            box(
              w * 0.3,
              0.3,
              d * 0.23,
              w * 0.2,
              0.15,
              d * 0.72,
              ENVIRONMENT_PALETTE.water_shallow,
            );
          }
        }
        continue;
      }
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
          .filter((b) => this.supports(b.defId))
          .map((b) => [b.id, b]),
      );
      this.rebuild();
    }
    if (e.t === 'buildingsChanged') {
      let changed = false;
      for (const id of e.removed)
        changed = this.buildings.delete(id) || changed;
      for (const b of e.added)
        if (this.supports(b.defId)) {
          this.buildings.set(b.id, b);
          changed = true;
        }
      for (const p of e.updated) {
        const b = this.buildings.get(p.id);
        if (b) {
          Object.assign(b, p);
          if (
            p.enabled !== undefined ||
            p.state !== undefined ||
            p.fire !== undefined
          )
            changed = true;
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
    if (p.trees)
      for (const pos of p.trees)
        ribbon(
          zoneBuildingFootprint({ pos, rotation: 0, lotW: 1, lotD: 1 }),
          true,
          1,
        );
    else ribbon(p.points, true, 1);
    this.preview.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(v, 3),
    );
    this.preview.geometry.computeBoundingSphere();
  }
  dispose() {
    this.clear();
    for (const mesh of this.plantedTrees) {
      mesh.geometry.dispose();
      if (!this.catalogTree) (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.group.removeFromParent();
  }
}
