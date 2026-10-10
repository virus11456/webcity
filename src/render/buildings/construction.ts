import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Plane,
  Vector3,
  type BufferGeometry as Geometry,
} from 'three';
import {
  BUILDING_FORM as F,
  type BuildingVolume,
} from '../../data/buildingAppearance';
import { BuildingGeometry } from './geometry';
import {
  BUILDING_DETAIL_PALETTE as P,
  ENVIRONMENT_PALETTE as E,
} from '../../data/palette';
import { constructionVisual } from '../../world/constructionVisual';
import type { WindowAtlas } from './windowAtlas';

/** Reusable staged building preview: foundation → frame → facade → complete; no simulation writes. */
export class ConstructionBuilding {
  readonly group = new Group();
  readonly completed: Mesh<Geometry, MeshStandardMaterial>;
  private readonly frame: Mesh<Geometry, MeshStandardMaterial>;
  private readonly scaffold: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly site = new Group();
  private readonly crane = new Group();
  private readonly craneSite = new Group();
  private readonly structurePlane = new Plane(new Vector3(0, -1, 0), 0);
  private readonly facadePlane = new Plane(new Vector3(0, -1, 0), 0);
  readonly height: number;
  private progress = 1;
  private effects = true;
  setEffects(enabled: boolean): void {
    this.effects = enabled;
    this.scaffold.visible = enabled && this.visual.scaffolding;
    this.craneSite.visible = enabled;
  }
  private readonly visual = constructionVisual(1);
  private readonly ownedGeometries: BufferGeometry[] = [];
  private readonly ownedMaterials: (
    MeshStandardMaterial | LineBasicMaterial
  )[] = [];
  constructor(
    private readonly geometry: Geometry,
    atlas: WindowAtlas,
  ) {
    const b = geometry.boundingBox!;
    this.height = b.max.y;
    const width = b.max.x - b.min.x,
      depth = b.max.z - b.min.z,
      centerZ = (b.min.z + b.max.z) / 2;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      map: atlas.map,
      emissiveMap: atlas.emissiveMap,
      emissive: P.windowLight,
      emissiveIntensity: 0,
      roughness: 0.85,
      clippingPlanes: [this.facadePlane],
      clipShadows: true,
    });
    this.completed = new Mesh(geometry, material);
    this.completed.castShadow = this.completed.receiveShadow = true;
    const frameMaterial = new MeshStandardMaterial({
      color: P.concrete,
      roughness: 0.95,
      clippingPlanes: [this.structurePlane],
      clipShadows: true,
    });
    const skeleton = new BuildingGeometry();
    for (const v of geometry.userData.massing as BuildingVolume[]) {
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          skeleton.box(
            v.x + sx * (v.w / 2 - 0.2),
            v.y,
            v.z + sz * (v.d / 2 - 0.2),
            0.35,
            v.h,
            0.35,
            P.concrete,
          );
      for (let floor = 0; floor <= v.floors; floor++)
        skeleton.box(
          v.x,
          v.y + (floor * v.h) / v.floors,
          v.z,
          v.w,
          0.18,
          v.d,
          P.concrete,
        );
    }
    const skeletonGeometry = skeleton.finish();
    this.ownedGeometries.push(skeletonGeometry);
    this.frame = new Mesh(skeletonGeometry, frameMaterial);
    this.frame.castShadow = this.frame.receiveShadow = true;
    const lines: number[] = [],
      gap = F.construction.scaffoldGap;
    const l = b.min.x - gap,
      r = b.max.x + gap,
      front = b.max.z + gap,
      back = b.min.z - gap;
    const line = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
    ) => lines.push(ax, ay, az, bx, by, bz);
    for (const x of [l, r])
      for (const z of [front, back]) line(x, 0, z, x, this.height, z);
    for (
      let y = F.construction.scaffoldFloor;
      y < this.height;
      y += F.construction.scaffoldFloor
    ) {
      line(l, y, front, r, y, front);
      line(r, y, front, r, y, back);
      line(r, y, back, l, y, back);
      line(l, y, back, l, y, front);
      line(l, y - F.construction.scaffoldFloor, front, r, y, front);
      line(r, y - F.construction.scaffoldFloor, back, l, y, back);
    }
    const scaffoldGeometry = new BufferGeometry();
    scaffoldGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(lines, 3),
    );
    const scaffoldMaterial = new LineBasicMaterial({
      color: P.scaffold,
      clippingPlanes: [this.structurePlane],
    });
    this.scaffold = new LineSegments(scaffoldGeometry, scaffoldMaterial);
    const foundationGeometry = new BoxGeometry(
        width,
        F.construction.foundationHeight,
        depth,
      ),
      foundationMaterial = new MeshStandardMaterial({
        color: E.dirt,
        roughness: 1,
      });
    const foundation = new Mesh(foundationGeometry, foundationMaterial);
    foundation.position.set(0, F.construction.foundationHeight / 2, centerZ);
    this.site.add(foundation);
    this.ownedGeometries.push(scaffoldGeometry, foundationGeometry);
    this.ownedMaterials.push(
      material,
      frameMaterial,
      scaffoldMaterial,
      foundationMaterial,
    );
    if (this.height > 18) {
      const craneMaterial = new MeshStandardMaterial({
        color: P.crane,
        roughness: 0.8,
      });
      this.ownedMaterials.push(craneMaterial);
      const add = (
        w: number,
        h: number,
        d: number,
        x: number,
        y: number,
        z: number,
        parent: Group,
      ) => {
        const g = new BoxGeometry(w, h, d),
          m = new Mesh(g, craneMaterial);
        m.position.set(x, y, z);
        parent.add(m);
        this.ownedGeometries.push(g);
      };
      const h = this.height + 5,
        cx = width / 2 + 1;
      add(0.6, h, 0.6, cx, h / 2, centerZ, this.craneSite);
      this.crane.position.set(cx, h, centerZ);
      this.craneSite.add(this.crane);
      this.site.add(this.craneSite);
      add(width * 1.15, 0.5, 0.5, -width * 0.3, 0, 0, this.crane);
      add(1.5, 1, 1, width * 0.2, -0.5, 0, this.crane);
      add(0.06, 4, 0.06, -width * 0.75, -2, 0, this.crane);
    }
    this.group.add(this.completed, this.frame, this.scaffold, this.site);
    this.setProgress(1);
  }
  /** World base Y lets the same clipping planes work when later attached to terrain. */
  setProgress(progress: number, baseY = 0): void {
    const s = constructionVisual(progress, this.visual);
    this.progress = s.progress;
    this.structurePlane.constant =
      baseY +
      Math.max(F.construction.foundationHeight, this.height * s.structure);
    this.facadePlane.constant =
      baseY + this.height * s.facade + (s.progress === 1 ? 1 : 0);
    this.completed.visible = s.facade > 0;
    this.frame.visible = s.progress > 0 && s.progress < 1;
    this.scaffold.visible = this.effects && s.scaffolding;
    this.site.visible = s.progress < 1;
    // The completed facade sits on the gray frame; polygon offset prevents coplanar flicker.
    this.completed.material.polygonOffset = s.progress < 1;
    this.completed.material.polygonOffsetFactor = -1;
    this.completed.material.polygonOffsetUnits = -1;
  }
  setNight(night: boolean): void {
    this.completed.material.emissiveIntensity = night ? 1.4 : 0;
  }
  update(seconds: number): void {
    if (this.effects && this.progress > 0 && this.progress < 1)
      this.crane.rotation.y += seconds * 0.2;
  }
  readState() {
    return {
      ...constructionVisual(this.progress),
      frameVisible: this.frame.visible,
      facadeVisible: this.completed.visible,
      scaffoldVisible: this.scaffold.visible,
      siteVisible: this.site.visible,
      frameHeight: this.structurePlane.constant,
      facadeHeight: this.facadePlane.constant,
    };
  }
  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    for (const g of this.ownedGeometries) g.dispose();
    for (const m of this.ownedMaterials) m.dispose();
  }
}
