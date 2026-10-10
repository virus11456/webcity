import type { FacilityAssets } from './facilities/assets';
import { SEA_LEVEL } from '../data/config';
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Scene,
  type Object3D,
} from 'three';
import type { SimEvent } from '../bridge/protocol';
import { POWER } from '../data/power';
import { UTILITY_RULES } from '../data/buildings';
import { BUILDING_PALETTE, SERVICE_PALETTE, UI_PALETTE } from '../data/palette';
import { distance, lerp } from '../core/math';
import {
  pathEdges,
  plantDefinition,
  windAt,
  type PowerPreview,
} from '../world/power';
import type { Building } from '../world/types';
import type { NetworkSegment } from '../world/snapshot';
/** Original procedural utility models; authoritative events alone add/remove placed assets. */
export class PowerRenderer {
  readonly group = new Group();
  private readonly preview = new Group();
  private readonly assets = new Map<string, Group>();
  private readonly rotors = new Map<
    number,
    { group: Object3D; speed: number }
  >();
  private seed = 0;
  private readonly concrete = new MeshStandardMaterial({
    color: SERVICE_PALETTE.power,
    roughness: 0.9,
  });
  private readonly pale = new MeshStandardMaterial({
    color: BUILDING_PALETTE.RL.accents[0],
    roughness: 0.6,
  });
  private readonly dark = new MeshStandardMaterial({
    color: BUILDING_PALETTE.industrial.roofs[0],
    roughness: 0.9,
  });
  private readonly wires = new LineBasicMaterial({
    color: BUILDING_PALETTE.office.accents[0],
  });
  private readonly ghost = new LineBasicMaterial({
    color: UI_PALETTE.accent,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  private readonly coverage = new LineBasicMaterial({
    color: UI_PALETTE.positive,
    depthTest: false,
    transparent: true,
    opacity: 0.5,
  });
  constructor(
    scene: Scene,
    private readonly height: (x: number, z: number) => number,
    private catalog?: FacilityAssets,
  ) {
    this.group.add(this.preview);
    scene.add(this.group);
  }
  private box(
    parent: Group,
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
    parent.add(m);
    return m;
  }
  private pole(
    parent: Group,
    r: number,
    h: number,
    x: number,
    y: number,
    z: number,
    material = this.concrete,
  ) {
    const m = new Mesh(new CylinderGeometry(r * 0.65, r, h, 6), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  private free(g: Group) {
    g.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
    });
    g.removeFromParent();
  }
  private remove(key: string) {
    const g = this.assets.get(key);
    if (g) this.free(g);
    this.assets.delete(key);
    if (key.startsWith('b')) this.rotors.delete(Number(key.slice(1)));
  }
  private plant(b: Building) {
    const key = `b${b.id}`;
    this.remove(key);
    if (!plantDefinition(b.defId)) return;
    const g = new Group();
    g.position.set(b.pos.x, this.height(b.pos.x, b.pos.z), b.pos.z);
    g.rotation.y = b.rotation;
    const w = b.lotW * 8,
      d = b.lotD * 8;
    const formal = this.catalog?.request(b, () => {
      if (this.assets.has(key)) this.plant(b);
    });
    if (formal) {
      g.add(formal);
      const rotor = formal.getObjectByName('Rotor0');
      if (rotor)
        this.rotors.set(b.id, {
          group: rotor,
          speed: windAt(this.seed, b.pos) * POWER.rotorSpeed,
        });
      this.assets.set(key, g);
      this.group.add(g);
      return;
    }
    this.box(g, w, 1, d, 0, 0.5, d / 2);
    if (b.defId === 'power_wind') {
      this.pole(
        g,
        1.2,
        POWER.rotorHeightM,
        0,
        POWER.rotorHeightM / 2,
        d / 2,
        this.pale,
      );
      this.box(g, 3, 3, 5, 0, POWER.rotorHeightM, d / 2, this.pale);
      const rotor = new Group();
      rotor.position.set(0, POWER.rotorHeightM, d / 2 - 3);
      g.add(rotor);
      for (let i = 0; i < 3; i++) {
        const blade = new Group();
        blade.rotation.z = (i * Math.PI * 2) / 3;
        this.box(
          blade,
          1.1,
          POWER.rotorRadiusM,
          0.5,
          0,
          POWER.rotorRadiusM / 2,
          0,
          this.pale,
        );
        rotor.add(blade);
      }
      this.rotors.set(b.id, {
        group: rotor,
        speed: windAt(this.seed, b.pos) * POWER.rotorSpeed,
      });
    } else {
      this.box(g, w * 0.7, 12, d * 0.55, 0, 7, d * 0.55);
      this.box(g, w * 0.74, 1, d * 0.59, 0, 13.5, d * 0.55, this.dark);
      for (const x of [-w * 0.25, w * 0.25]) {
        this.pole(g, 2, 28, x, 15, d * 0.8);
        this.pole(g, 2.1, 3, x, 27, d * 0.8, this.pale);
      }
      for (let i = 0; i < 4; i++)
        this.box(g, 5, 4, 2, -15 + i * 10, 4, 1, this.dark);
    }
    this.assets.set(key, g);
    this.group.add(g);
  }
  private line(n: NetworkSegment) {
    const key = `n${n.id}`;
    this.remove(key);
    const g = new Group(),
      positions: number[] = [];
    for (const [a, b] of pathEdges(n.points, false)) {
      const steps = Math.ceil(distance(a, b) / POWER.towerSpacingM);
      for (let i = 0; i <= steps; i++) {
        const p = lerp(a, b, i / steps),
          y = this.height(p.x, p.z),
          h = POWER.towerHeightM;
        const top = Math.max(y, SEA_LEVEL) + h;
        this.pole(g, 0.5, top - y, p.x, (y + top) / 2, p.z);
        this.box(g, POWER.towerWidthM, 0.5, 0.5, p.x, top, p.z, this.dark);
        if (i < steps) {
          const q = lerp(a, b, (i + 1) / steps),
            qy = this.height(q.x, q.z);
          for (const side of [-2, 0, 2])
            positions.push(
              p.x + side,
              top,
              p.z,
              q.x + side,
              Math.max(qy, SEA_LEVEL) + h,
              q.z,
            );
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.add(new LineSegments(geo, this.wires));
    this.assets.set(key, g);
    this.group.add(g);
  }
  accept(e: SimEvent) {
    if (e.t === 'ready') {
      this.seed = e.snapshot.seed;
      for (const key of [...this.assets.keys()]) this.remove(key);
      for (const b of e.snapshot.buildings) this.plant(b);
      for (const n of e.snapshot.networks.power) this.line(n);
    }
    if (e.t === 'buildingsChanged') {
      for (const id of e.removed) this.remove(`b${id}`);
      for (const b of e.added) this.plant(b);
    }
    if (e.t === 'networksChanged' && e.net === 'power') {
      for (const id of e.removed) this.remove(`n${id}`);
      for (const n of e.added) this.line(n);
    }
  }
  readStats() {
    return {
      rotors: this.rotors.size,
      rotorAngle: this.rotors.values().next().value?.group.rotation.z ?? 0,
    };
  }
  show(p: PowerPreview | null) {
    for (const c of [...this.preview.children]) {
      if (c instanceof LineSegments) c.geometry.dispose();
      c.removeFromParent();
    }
    if (!p?.points.length) return;
    this.ghost.color.set(p.valid ? UI_PALETTE.accent : UI_PALETTE.negative);
    const draw = (
      points: readonly { x: number; z: number }[],
      closed: boolean,
      mat: LineBasicMaterial,
      lift: number,
    ) => {
      const data: number[] = [];
      for (const [a, b] of pathEdges(points, closed))
        data.push(
          a.x,
          Math.max(this.height(a.x, a.z), SEA_LEVEL) + lift,
          a.z,
          b.x,
          Math.max(this.height(b.x, b.z), SEA_LEVEL) + lift,
          b.z,
        );
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(data, 3));
      const line = new LineSegments(geometry, mat);
      line.renderOrder = 100;
      this.preview.add(line);
    };
    draw(p.points, p.closed, this.ghost, p.closed ? 1 : POWER.towerHeightM);
    if (!p.closed) {
      const r = UTILITY_RULES.powerReachM;
      for (const [a, b] of pathEdges(p.points, false)) {
        const l = distance(a, b);
        if (!l) continue;
        const dx = (-(b.z - a.z) / l) * r,
          dz = ((b.x - a.x) / l) * r;
        draw(
          [
            { x: a.x + dx, z: a.z + dz },
            { x: b.x + dx, z: b.z + dz },
            { x: b.x - dx, z: b.z - dz },
            { x: a.x - dx, z: a.z - dz },
          ],
          true,
          this.coverage,
          0.7,
        );
      }
      for (const a of p.points)
        draw(
          Array.from({ length: 32 }, (_, i) => ({
            x: a.x + Math.cos((i * Math.PI) / 16) * r,
            z: a.z + Math.sin((i * Math.PI) / 16) * r,
          })),
          true,
          this.coverage,
          0.7,
        );
    }
    if (p.closed) {
      const outline: { x: number; z: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const a = p.points[i]!,
          prev = p.points[(i + 3) % 4]!,
          next = p.points[(i + 1) % 4]!;
        const angle = Math.atan2(a.z - prev.z, a.x - prev.x) - Math.PI / 2;
        const turn =
          Math.atan2(next.z - a.z, next.x - a.x) -
          Math.atan2(a.z - prev.z, a.x - prev.x);
        const arc = (turn + Math.PI * 2) % (Math.PI * 2);
        for (let j = 0; j <= 8; j++) {
          const t = angle + (arc * j) / 8;
          outline.push({
            x: a.x + Math.cos(t) * UTILITY_RULES.powerReachM,
            z: a.z + Math.sin(t) * UTILITY_RULES.powerReachM,
          });
        }
      }
      draw(outline, true, this.coverage, 0.7);
    }
  }
  update(seconds: number) {
    if (!this.group.visible) return;
    for (const r of this.rotors.values())
      r.group.rotation.z += Math.min(seconds, 0.1) * r.speed;
  }
  dispose() {
    for (const key of [...this.assets.keys()]) this.remove(key);
    this.show(null);
    this.group.removeFromParent();
    for (const m of [
      this.concrete,
      this.pale,
      this.dark,
      this.wires,
      this.ghost,
      this.coverage,
    ])
      m.dispose();
  }
}
