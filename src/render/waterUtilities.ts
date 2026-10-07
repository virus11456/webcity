import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Scene,
} from 'three';
import { WATER_UTILITY as W } from '../data/waterUtility';
import { UTILITY_RULES } from '../data/buildings';
import {
  BUILDING_DETAIL_PALETTE,
  ENVIRONMENT_PALETTE,
  UI_PALETTE,
} from '../data/palette';
import { SEA_LEVEL, CELL_SIZE } from '../data/config';
import { pathEdges } from '../world/power';
import { waterDefinition, type WaterPreview } from '../world/waterUtility';
import { zoneBuildingFootprint } from '../world/zoneGeometry';
import type { Building, Vec2 } from '../world/types';
import type { NetworkSegment } from '../world/snapshot';
import type { SimEvent } from '../bridge/protocol';
/** Original utility models and batched underground ribbons, updated only by acknowledged events. */
export class WaterUtilityRenderer {
  readonly group = new Group();
  readonly pipes = new Group();
  private preview = new Group();
  private assets = new Map<number, Group>();
  private networks = new Map<number, NetworkSegment>();
  private underground = false;
  private concrete = new MeshStandardMaterial({
    color: BUILDING_DETAIL_PALETTE.concrete,
    roughness: 0.8,
  });
  private steel = new MeshStandardMaterial({
    color: BUILDING_DETAIL_PALETTE.frame,
    roughness: 0.65,
  });
  private blue = new MeshStandardMaterial({
    color: ENVIRONMENT_PALETTE.water_deep,
    roughness: 0.6,
  });
  private line = new MeshBasicMaterial({
    color: UI_PALETTE.accent,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
  });
  private coverage = new MeshBasicMaterial({
    color: UI_PALETTE.accent,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: W.coverageOpacity,
  });
  private ghost = new LineBasicMaterial({
    color: UI_PALETTE.accent,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  });
  constructor(
    scene: Scene,
    private height: (x: number, z: number) => number,
  ) {
    this.group.add(this.pipes, this.preview);
    this.pipes.visible = false;
    scene.add(this.group);
  }
  private clear(g: Group) {
    g.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
    });
    g.clear();
  }
  private remove(id: number) {
    const g = this.assets.get(id);
    if (g) {
      this.clear(g);
      g.removeFromParent();
      this.assets.delete(id);
    }
  }
  private box(
    g: Group,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material = this.concrete,
  ) {
    const m = new Mesh(new BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  private cylinder(
    g: Group,
    r: number,
    h: number,
    x: number,
    y: number,
    z: number,
    material = this.steel,
  ) {
    const m = new Mesh(new CylinderGeometry(r, r, h, 10), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  }
  private plant(b: Building) {
    if (!waterDefinition(b.defId)) return;
    this.remove(b.id);
    const g = new Group(),
      width = b.lotW * CELL_SIZE,
      depth = b.lotD * CELL_SIZE;
    const base = Math.max(
      ...zoneBuildingFootprint(b).map((p) => this.height(p.x, p.z)),
    );
    g.position.set(b.pos.x, base, b.pos.z);
    g.rotation.y = b.rotation;
    // Bank facilities use short piers under their level platform instead of floating over the slope.
    for (const x of [-width / 2 + 1, width / 2 - 1])
      for (const z of [1, depth - 1]) {
        const wx =
          b.pos.x + Math.cos(b.rotation) * x + Math.sin(b.rotation) * z;
        const wz =
          b.pos.z - Math.sin(b.rotation) * x + Math.cos(b.rotation) * z;
        const support = base - this.height(wx, wz);
        if (support > 0.3)
          this.cylinder(g, 0.7, support, x, -support / 2, z, this.concrete);
      }
    this.box(g, width, 1, depth, 0, 0.5, depth / 2);
    if (b.defId === 'water_tower') {
      for (const x of [-4, 4])
        for (const z of [4, 12]) this.cylinder(g, 0.6, 20, x, 11, z);
      this.cylinder(g, 6, 8, 0, 25, 8, this.blue);
      this.cylinder(g, 6.3, 0.6, 0, 29.3, 8);
      this.cylinder(g, 0.8, 21, 0, 11, 8, this.blue);
    } else if (b.defId === 'water_treatment') {
      this.box(g, 10, 8, depth - 4, -9, 5, depth / 2);
      for (const z of [8, 24]) {
        this.cylinder(g, 6, 2, 7, 2, z);
        this.cylinder(g, 5, 1, 7, 3, z, this.blue);
      }
    } else {
      this.box(
        g,
        12,
        b.defId === 'water_pump' ? 7 : 4,
        10,
        0,
        b.defId === 'water_pump' ? 4.5 : 3,
        9,
      );
      this.box(
        g,
        13,
        0.7,
        11,
        0,
        b.defId === 'water_pump' ? 8.4 : 5.4,
        9,
        this.blue,
      );
      // A visible intake/outlet reaches below the water, while the main footprint remains dry.
      const a = new Vector3(0, 2, 0),
        end = new Vector3(
          0,
          SEA_LEVEL - base - W.intakeDepthM,
          -W.intakeLengthM,
        ),
        delta = end.clone().sub(a);
      const pipe = this.cylinder(g, 1, delta.length(), 0, 0, 0, this.blue);
      pipe.position.copy(a.add(end).multiplyScalar(0.5));
      pipe.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        delta.normalize(),
      );
    }
    this.assets.set(b.id, g);
    this.group.add(g);
  }
  private ribbon(
    paths: readonly Vec2[][],
    radius: number,
    material: MeshBasicMaterial,
    coverage = false,
  ) {
    const data: number[] = [];
    const add = (p: Vec2) =>
      data.push(p.x, this.height(p.x, p.z) - W.undergroundDepthM, p.z);
    for (const points of paths)
      for (const [a, b] of pathEdges(points, false)) {
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        if (!l) continue;
        const x = (-(b.z - a.z) / l) * radius,
          z = ((b.x - a.x) / l) * radius;
        const p = { x: a.x + x, z: a.z + z },
          q = { x: a.x - x, z: a.z - z },
          r = { x: b.x - x, z: b.z - z },
          s = { x: b.x + x, z: b.z + z };
        for (const v of [p, r, q, p, s, r]) add(v);
      }
    if (coverage)
      for (const points of paths)
        for (const p of [points[0], points.at(-1)])
          if (p)
            for (let i = 0; i < 24; i++) {
              add(p);
              add({
                x: p.x + Math.cos(((i + 1) * Math.PI) / 12) * radius,
                z: p.z + Math.sin(((i + 1) * Math.PI) / 12) * radius,
              });
              add({
                x: p.x + Math.cos((i * Math.PI) / 12) * radius,
                z: p.z + Math.sin((i * Math.PI) / 12) * radius,
              });
            }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(data, 3));
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, material);
    mesh.renderOrder = coverage ? 110 : 120;
    return mesh;
  }
  private rebuild() {
    this.clear(this.pipes);
    const paths = [...this.networks.values()].map((n) => n.points);
    this.pipes.add(
      this.ribbon(paths, UTILITY_RULES.waterReachM, this.coverage, true),
      this.ribbon(paths, W.pipeRadiusM, this.line),
    );
  }
  setUnderground(on: boolean) {
    this.underground = on;
    this.pipes.visible = on;
  }
  accept(e: SimEvent) {
    if (e.t === 'ready') {
      for (const id of [...this.assets.keys()]) this.remove(id);
      for (const b of e.snapshot.buildings) this.plant(b);
      this.networks = new Map(e.snapshot.networks.water.map((n) => [n.id, n]));
      this.rebuild();
    }
    if (e.t === 'buildingsChanged') {
      for (const id of e.removed) this.remove(id);
      for (const b of e.added) this.plant(b);
    }
    if (e.t === 'networksChanged' && e.net === 'water') {
      for (const id of e.removed) this.networks.delete(id);
      for (const n of e.added) this.networks.set(n.id, n);
      this.rebuild();
    }
    if (e.t === 'roadsChanged' && e.terrain) this.rebuild();
  }
  show(p: WaterPreview | null) {
    this.clear(this.preview);
    if (!p) return;
    this.ghost.color.set(p.valid ? UI_PALETTE.accent : UI_PALETTE.negative);
    const paths = p.paths ?? [p.points];
    if (!p.closed) {
      this.preview.add(
        this.ribbon(paths, UTILITY_RULES.waterReachM, this.coverage, true),
      );
    }
    const data: number[] = [];
    const add = (v: Vec2) =>
      data.push(
        v.x,
        Math.max(this.height(v.x, v.z), SEA_LEVEL) +
          (this.underground ? -W.undergroundDepthM : 1),
        v.z,
      );
    for (const points of paths)
      for (const [a, b] of pathEdges(points, p.closed)) {
        add(a);
        add(b);
      }
    if (p.intake && p.points.length >= 2) {
      const a = p.points[0]!,
        b = p.points[1]!;
      add({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      add(p.intake);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(data, 3));
    const line = new LineSegments(geo, this.ghost);
    line.renderOrder = 130;
    this.preview.add(line);
  }
  dispose() {
    for (const id of [...this.assets.keys()]) this.remove(id);
    this.clear(this.pipes);
    this.clear(this.preview);
    for (const m of [
      this.concrete,
      this.steel,
      this.blue,
      this.line,
      this.coverage,
      this.ghost,
    ])
      m.dispose();
    this.group.removeFromParent();
  }
}
