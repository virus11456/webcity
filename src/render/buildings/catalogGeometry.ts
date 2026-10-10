import {
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CatalogModel } from '../../world/modelCatalog';
import type { BuildingVolume } from '../../data/buildingAppearance';
import {
  BUILDING_DETAIL_PALETTE as P,
  BUILDING_PALETTE as B,
} from '../../data/palette';
import { CELL_SIZE } from '../../data/config';
import { generateBuilding } from './generator';
import { BuildingGeometry } from './geometry';

/** Authored catalog details layered over deterministic massing; front-centre origin and +Z road. */
export function catalogGeometry(
  model: CatalogModel,
  lod: 0 | 1 | 2,
): BufferGeometry {
  const { zone, level, w, d, seed, variant } = model;
  const base = generateBuilding(zone, level, w, d, seed, lod === 0),
    massing = base.userData.massing as BuildingVolume[];
  const height = Math.max(...massing.map((v) => v.y + v.h)),
    wall = base.userData.wall as string;
  let geometry: BufferGeometry;
  if (lod === 0) {
    const detail = new BuildingGeometry();
    const roof =
      zone === 'RL' ? B.RL.roofs[variant % B.RL.roofs.length]! : B.RH.roofs[0];
    if (zone === 'RL') {
      detail.box(
        -w * CELL_SIZE * 0.2,
        height,
        -d * CELL_SIZE * 0.55,
        0.65,
        1.9,
        0.65,
        P.concrete,
      );
      for (const side of [-1, 1])
        detail.box(
          side * ((w * CELL_SIZE) / 2 - 0.2),
          0.1,
          -d * CELL_SIZE * 0.62,
          0.12,
          0.65,
          d * CELL_SIZE * 0.7,
          roof,
        );
      detail.box(0, 0.12, -0.65, 2.3, 0.2, 1.1, P.concrete);
    } else {
      detail.box(0, 0.08, -1.2, w * CELL_SIZE * 0.34, 0.25, 1.8, P.concrete);
      detail.box(
        0,
        3.1,
        -1.65,
        w * CELL_SIZE * 0.38,
        0.2,
        2.3,
        B.RH.accents[0],
      );
      for (const x of [-1, 1])
        detail.box(
          x * w * CELL_SIZE * 0.17,
          0.08,
          -1.5,
          0.25,
          3.1,
          0.25,
          B.RH.accents[0],
        );
    }
    const extra = detail.finish();
    geometry = mergeGeometries([base, extra])!;
    extra.dispose();
  } else if (lod === 1) {
    const g = new BuildingGeometry();
    for (const v of massing)
      g.box(
        v.x,
        v.y,
        v.z,
        v.w,
        v.h,
        v.d,
        wall,
        wall,
        v.floors,
        zone,
        variant % 4,
      );
    if (zone === 'RL')
      g.roof(
        0,
        height,
        -d * CELL_SIZE * 0.58,
        w * CELL_SIZE - 0.8,
        d * CELL_SIZE - 2,
        2,
        B.RL.roofs[variant % B.RL.roofs.length]!,
        variant % 2 === 0,
      );
    geometry = g.finish();
  } else {
    const g = new BuildingGeometry();
    if (zone === 'RL') {
      geometry = new BoxGeometry(
        w * CELL_SIZE - 1,
        height + 2,
        d * CELL_SIZE - 2,
      ).toNonIndexed();
      geometry.translate(0, (height + 2) / 2, (-d * CELL_SIZE) / 2);
      const c = new Color(wall),
        a = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < a.length; i += 3) {
        a[i] = c.r;
        a[i + 1] = c.g;
        a[i + 2] = c.b;
      }
      geometry.setAttribute('color', new Float32BufferAttribute(a, 3));
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.02, 0.98);
    } else {
      for (const v of massing.slice(0, 2))
        g.box(v.x, v.y, v.z, v.w, v.h, v.d, wall);
      geometry = g.finish();
    }
  }
  geometry.userData = { ...base.userData, assetId: model.id, lod };
  base.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
