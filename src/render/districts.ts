import {
  Group,
  Mesh,
  MeshBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Color,
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  DoubleSide,
  type Scene,
} from 'three';
import { DISTRICTS as D } from '../data/districts';
import { ZONE_PALETTE, UI_PALETTE } from '../data/palette';
import {
  districtPoint,
  districtBrush,
  type DistrictView,
} from '../world/districts';
import type { Vec2 } from '../world/types';
/** Geometry only changes after painting; the render loop only toggles label visibility. */
export class DistrictRenderer {
  readonly group = new Group();
  private fill = new Group();
  private labels = new Group();
  private preview = new Group();
  private key = '';
  private active = false;
  private jobs: { cells: number[]; color: string }[] = [];
  private material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: D.opacity,
    depthWrite: false,
    side: DoubleSide,
  });
  constructor(
    scene: Scene,
    private height: (x: number, z: number) => number,
  ) {
    scene.add(this.group);
    this.group.add(this.fill, this.labels, this.preview);
  }
  private mesh(cells: readonly number[], color: string) {
    const data: number[] = [],
      colors: number[] = [],
      c = new Color(color);
    for (const cell of cells) {
      const p = districtPoint(cell);
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const x = p.x + (dx! * D.cellM) / 2,
          z = p.z + (dz! * D.cellM) / 2;
        data.push(x, this.height(x, z) + D.surfaceLiftM, z);
        colors.push(c.r, c.g, c.b);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(data, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return new Mesh(g, this.material);
  }
  update(
    active: boolean,
    districts: DistrictView[],
    points: Vec2[],
    radius: number,
    ownedTiles: number[],
  ) {
    this.active = active;
    this.fill.visible = active;
    this.clear(this.preview);
    if (points.length)
      this.preview.add(
        this.mesh(
          districtBrush(points.slice(-1), radius, ownedTiles),
          UI_PALETTE.accent,
        ),
      );
    const key = JSON.stringify(districts.map((d) => [d.id, d.name, d.cells]));
    if (key === this.key) return;
    this.key = key;
    this.jobs = [];
    this.clear(this.fill);
    this.clear(this.labels);
    const colors = Object.values(ZONE_PALETTE);
    for (const d of districts) {
      if (!d.cells.length) continue;
      for (let i = 0; i < d.cells.length; i += D.renderCellsPerFrame)
        this.jobs.push({
          cells: d.cells.slice(i, i + D.renderCellsPerFrame),
          color: colors[d.id % colors.length]!.normal,
        });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = 'bold 60px system-ui';
      canvas.width = Math.min(
        1024,
        Math.ceil(ctx.measureText(d.name).width) + 32,
      );
      canvas.height = 96;
      ctx.font = 'bold 60px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8;
      ctx.strokeStyle = UI_PALETTE.panel;
      ctx.fillStyle = UI_PALETTE.text;
      ctx.strokeText(d.name, canvas.width / 2, 48, canvas.width - 32);
      ctx.fillText(d.name, canvas.width / 2, 48, canvas.width - 32);
      const texture = new CanvasTexture(canvas),
        sprite = new Sprite(
          new SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false,
          }),
        );
      sprite.position.set(
        d.center.x,
        this.height(d.center.x, d.center.z) + D.labelLiftM,
        d.center.z,
      );
      sprite.scale.set(
        (D.labelHeightM * canvas.width) / canvas.height,
        D.labelHeightM,
        1,
      );
      sprite.renderOrder = 10;
      this.labels.add(sprite);
    }
  }
  frame(distance: number) {
    const job = this.jobs.shift();
    if (job) this.fill.add(this.mesh(job.cells, job.color));
    this.labels.visible = this.active || distance >= D.labelDistanceM;
  }
  private clear(group: Group) {
    for (const child of group.children) {
      if (child instanceof Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      } else if (child instanceof Mesh) child.geometry.dispose();
    }
    group.clear();
  }
  dispose() {
    this.jobs = [];
    this.clear(this.fill);
    this.clear(this.labels);
    this.clear(this.preview);
    this.material.dispose();
    this.group.removeFromParent();
  }
}
