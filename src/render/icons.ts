import {
  CanvasTexture,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  Vector2,
  type PerspectiveCamera,
  type Scene,
  type Texture,
} from 'three';
import { PROBLEM_ICONS as R } from '../data/problemIcons';
import { UI_PALETTE as P, PWA_PALETTE } from '../data/palette';
import { PROBLEMS } from '../data/simulation';
import {
  buildingProblemIcons,
  type ProblemIcon,
} from '../world/buildingProblems';
import type { Building } from '../world/types';
import type { SimEvent } from '../bridge/protocol';
const kinds: ProblemIcon[] = [
  'noPower',
  'noWater',
  'noSewage',
  'noRoad',
  'noWorkers',
  'abandoned',
  'noGoods',
];
interface Entry {
  b: Building;
  kind: ProblemIcon;
  distance: number;
  anchor: Vector3;
}
/** Original outlined symbols drawn locally; no fonts, emoji or external image assets. */
function createAtlas(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = R.atlasCellPx * kinds.length;
  canvas.height = R.atlasCellPx;
  const c = canvas.getContext('2d')!;
  const line = (points: number[][], close = false) => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)));
    if (close) c.closePath();
    c.stroke();
  };
  for (let i = 0; i < kinds.length; i++) {
    c.save();
    c.translate(i * R.atlasCellPx, 0);
    c.fillStyle = PWA_PALETTE.background;
    c.strokeStyle = i < 2 ? P.negative : i === 5 ? P.secondaryText : P.warning;
    c.lineWidth = 5;
    c.lineCap = c.lineJoin = 'round';
    c.beginPath();
    c.roundRect(7, 7, 82, 82, 22);
    c.fill();
    c.stroke();
    c.strokeStyle = P.text;
    c.fillStyle = P.text;
    c.lineWidth = 5;
    switch (kinds[i]) {
      case 'noGoods':
        line(
          [
            [24, 34],
            [48, 22],
            [72, 34],
            [72, 62],
            [48, 75],
            [24, 62],
          ],
          true,
        );
        line([
          [24, 34],
          [48, 47],
          [72, 34],
        ]);
        line([
          [48, 47],
          [48, 75],
        ]);
        break;
      case 'noPower':
        line(
          [
            [52, 21],
            [30, 51],
            [47, 51],
            [41, 75],
            [67, 42],
            [50, 42],
          ],
          true,
        );
        break;
      case 'noWater':
        c.beginPath();
        c.moveTo(48, 22);
        c.bezierCurveTo(8, 65, 43, 83, 61, 67);
        c.bezierCurveTo(77, 54, 58, 35, 48, 22);
        c.stroke();
        line([
          [36, 59],
          [39, 65],
          [46, 67],
        ]);
        break;
      case 'noSewage':
        line([
          [28, 25],
          [28, 53],
          [56, 53],
          [56, 70],
        ]);
        line([
          [40, 25],
          [40, 41],
          [69, 41],
          [69, 69],
        ]);
        line([
          [49, 67],
          [62, 77],
          [76, 67],
        ]);
        break;
      case 'noRoad':
        line(
          [
            [24, 36],
            [72, 36],
            [72, 58],
            [24, 58],
          ],
          true,
        );
        line([
          [32, 60],
          [32, 73],
        ]);
        line([
          [64, 60],
          [64, 73],
        ]);
        line([
          [28, 53],
          [42, 39],
        ]);
        line([
          [48, 53],
          [62, 39],
        ]);
        break;
      case 'noWorkers':
        c.beginPath();
        c.arc(48, 45, 20, Math.PI, 0);
        c.stroke();
        line([
          [24, 47],
          [72, 47],
        ]);
        line([
          [48, 24],
          [48, 39],
        ]);
        line([
          [30, 69],
          [30, 59],
          [66, 59],
          [66, 69],
        ]);
        break;
      case 'abandoned':
        line([
          [23, 45],
          [48, 24],
          [73, 45],
        ]);
        line([
          [29, 44],
          [29, 73],
          [67, 73],
          [67, 44],
        ]);
        line([
          [40, 49],
          [56, 66],
        ]);
        line([
          [56, 49],
          [40, 66],
        ]);
        break;
    }
    c.restore();
  }
  return new CanvasTexture(canvas);
}
/** Event-fed, one icon per building, near-first screen spacing and a single instanced draw. */
export class ProblemIcons {
  readonly group = new Group();
  readonly geometry = new InstancedBufferGeometry();
  readonly material: ShaderMaterial;
  private readonly entries = new Map<number, Entry>();
  private readonly candidates: Entry[] = [];
  private readonly anchors = new InstancedBufferAttribute(
    new Float32Array(R.limit * 3),
    3,
  );
  private readonly tiles = new InstancedBufferAttribute(
    new Float32Array(R.limit),
    1,
  );
  private readonly screens = new Float32Array(R.limit * 2);
  private readonly projected = new Vector3();
  private readonly texture: Texture;
  private disposed = false;
  private elapsed = 0;
  private readonly visibleIds: number[] = [];
  constructor(
    parent: Scene | Group,
    private readonly roof: (id: number, out: Vector3) => boolean,
    texture?: Texture,
  ) {
    this.texture = texture ?? createAtlas();
    const plane = new PlaneGeometry(1, 1);
    this.geometry.setIndex(plane.index);
    this.geometry.setAttribute('position', plane.getAttribute('position'));
    this.geometry.setAttribute('uv', plane.getAttribute('uv'));
    this.geometry.setAttribute('anchor', this.anchors);
    this.geometry.setAttribute('tile', this.tiles);
    this.geometry.instanceCount = 0;
    plane.dispose();
    this.material = new ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        map: { value: this.texture },
        pixels: { value: new Vector2() },
        time: { value: 0 },
      },
      vertexShader: `attribute vec3 anchor; attribute float tile; uniform vec2 pixels; uniform float time; varying vec2 vUv;
      void main(){vUv=vec2((uv.x+tile)/6.0,uv.y); vec4 clip=projectionMatrix*modelViewMatrix*vec4(anchor,1.0); vec2 offset=position.xy*${R.sizePx.toFixed(1)}; offset.y+=sin(time*${R.bobSpeed}+anchor.x)*${R.bobPx.toFixed(1)};clip.xy+=offset*pixels*clip.w;gl_Position=clip;}`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main(){gl_FragColor=texture2D(map,vUv);if(gl_FragColor.a<0.01)discard;}`,
    });
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 50;
    this.group.add(mesh);
    parent.add(this.group);
  }
  private put(b: Building): void {
    const problems = buildingProblemIcons(b);
    if (!problems.length) {
      this.entries.delete(b.id);
      return;
    }
    problems.sort((a, bp) => {
      const left =
        a === 'abandoned' ? -Infinity : PROBLEMS[a].days - b.problemTimers[a];
      const right =
        bp === 'abandoned'
          ? -Infinity
          : PROBLEMS[bp].days - b.problemTimers[bp];
      return left - right;
    });
    const old = this.entries.get(b.id);
    this.entries.set(b.id, {
      b,
      kind: problems[0]!,
      distance: 0,
      anchor: old?.anchor ?? new Vector3(),
    });
  }
  reset(buildings: readonly Building[]): void {
    this.entries.clear();
    this.records.clear();
    for (const b of buildings) {
      const copy = structuredClone(b);
      this.records.set(b.id, copy);
      this.put(copy);
    }
  }
  accept(e: SimEvent): void {
    if (this.disposed) return;
    if (e.t === 'ready') this.reset(e.snapshot.buildings);
    if (e.t !== 'buildingsChanged') return;
    for (const id of e.removed) this.entries.delete(id);
    // Keep all authoritative records, including healthy ones, for partial flag patches.
    for (const b of e.added) this.records.set(b.id, structuredClone(b));
    for (const p of e.updated) {
      const b = this.records.get(p.id);
      if (b) Object.assign(b, structuredClone(p));
    }
    for (const id of e.removed) this.records.delete(id);
    for (const b of e.added) this.put(this.records.get(b.id)!);
    for (const p of e.updated) {
      const b = this.records.get(p.id);
      if (b) this.put(b);
    }
  }
  private readonly records = new Map<number, Building>();
  update(
    seconds: number,
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): void {
    if (this.disposed) return;
    this.elapsed += Math.max(0, Math.min(seconds, 0.05));
    this.material.uniforms.time!.value = this.elapsed;
    (this.material.uniforms.pixels!.value as Vector2).set(
      2 / width,
      2 / height,
    );
    this.candidates.length = 0;
    this.visibleIds.length = 0;
    camera.updateMatrixWorld();
    for (const e of this.entries.values()) {
      if (!this.roof(e.b.id, e.anchor)) continue;
      e.anchor.y += R.roofGapM;
      e.distance = e.anchor.distanceToSquared(camera.position);
      if (e.distance <= R.distanceM ** 2) this.candidates.push(e);
    }
    this.candidates.sort(compareEntries);
    let count = 0;
    for (const e of this.candidates) {
      this.projected.copy(e.anchor).project(camera);
      const p = this.projected;
      if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1)
        continue;
      const x = (p.x * width) / 2,
        y = (p.y * height) / 2;
      let overlap = false;
      for (let j = 0; j < count; j++)
        if (
          Math.abs(x - this.screens[j * 2]!) < R.spacingPx &&
          Math.abs(y - this.screens[j * 2 + 1]!) < R.spacingPx
        ) {
          overlap = true;
          break;
        }
      if (overlap) continue;
      this.screens[count * 2] = x;
      this.screens[count * 2 + 1] = y;
      this.anchors.setXYZ(count, e.anchor.x, e.anchor.y, e.anchor.z);
      this.tiles.setX(count, kinds.indexOf(e.kind));
      this.visibleIds.push(e.b.id);
      if (++count === R.limit) break;
    }
    this.geometry.instanceCount = count;
    this.anchors.needsUpdate = this.tiles.needsUpdate = true;
  }
  readStats() {
    return {
      visible: this.group.visible ? this.geometry.instanceCount : 0,
      problems: this.entries.size,
      ids: [...this.visibleIds],
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.entries.clear();
    this.records.clear();
    this.candidates.length = 0;
    this.visibleIds.length = 0;
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.group.removeFromParent();
  }
}
function compareEntries(a: Entry, b: Entry): number {
  return a.distance - b.distance || a.b.id - b.b.id;
}
