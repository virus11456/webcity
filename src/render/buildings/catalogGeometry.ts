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
  const base = generateBuilding(
      zone,
      level,
      w,
      d,
      seed,
      lod === 0 || zone === 'I',
    ),
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
    } else if (zone === 'RH') {
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
    if (zone === 'CL' || zone === 'CH') {
      const accent = B.commercial.accents[(variant - 1) % 4]!;
      // Freestanding shop sign, supported entrance canopy, and roof ventilation.
      detail.box(w * CELL_SIZE * 0.38, 0.08, -0.8, 0.14, 3.4, 0.14, P.frame);
      detail.box(w * CELL_SIZE * 0.38, 2.2, -0.8, 1, 1.1, 0.18, accent);
      for (const side of [-1, 1])
        detail.box(
          side * w * CELL_SIZE * 0.32,
          0.08,
          -0.7,
          0.16,
          2.8,
          0.16,
          P.frame,
        );
      for (let i = 0; i < variant; i++)
        detail.box(
          (i - (variant - 1) / 2) * 1.3,
          height + 0.08,
          -d * CELL_SIZE * 0.62,
          0.8,
          0.55,
          1.1,
          B.RH.roofs[1],
        );
    } else if (zone === 'I') {
      // Loading apron, safety bollards and stacked cargo stay inside the parcel.
      for (const x of [-1, 1])
        detail.box(
          x * w * CELL_SIZE * 0.2,
          0.08,
          -0.55,
          0.2,
          1,
          0.2,
          B.industrial.accents[3],
        );
      detail.box(
        w * CELL_SIZE * 0.37,
        0.08,
        -d * CELL_SIZE * 0.54,
        w * CELL_SIZE * 0.16,
        1.9 + variant * 0.3,
        3.8,
        B.industrial.walls[variant % 4]!,
      );
      for (let i = 0; i < 4; i++)
        detail.box(
          w * CELL_SIZE * 0.37,
          0.08,
          -d * CELL_SIZE * 0.54 - 1.5 + i,
          w * CELL_SIZE * 0.17,
          2.1,
          0.08,
          B.industrial.roofs[0],
        );
    } else if (zone === 'O') {
      // Glass lobby, white mullions and a recessed entry roof distinguish offices.
      detail.box(
        0,
        0.08,
        -1.15,
        w * CELL_SIZE * 0.5,
        3.8,
        0.3,
        B.office.walls[variant % 3]!,
      );
      detail.box(
        0,
        3.9,
        -1.1,
        w * CELL_SIZE * 0.55,
        0.2,
        1.4,
        B.office.walls[3],
      );
      for (let i = -2; i <= 2; i++)
        detail.box(
          i * w * CELL_SIZE * 0.1,
          0.08,
          -0.9,
          0.12,
          3.8,
          0.15,
          B.office.walls[3],
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
    if (zone === 'I' && level >= 2) {
      const chimneyHeight = base.boundingBox!.max.y;
      g.box(
        (w * CELL_SIZE - 1.6) * 0.39,
        0,
        -d * CELL_SIZE + 2,
        0.95,
        chimneyHeight,
        0.95,
        B.industrial.accents[0],
      );
    }
    geometry = g.finish();
  } else {
    const g = new BuildingGeometry();
    if (zone === 'RL' || zone === 'CL' || zone === 'I') {
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
      const bottom = massing[0]!;
      g.box(bottom.x, bottom.y, bottom.z, bottom.w, bottom.h, bottom.d, wall);
      const upper = massing.slice(1);
      if (upper.length) {
        const minX = Math.min(...upper.map((v) => v.x - v.w / 2)),
          maxX = Math.max(...upper.map((v) => v.x + v.w / 2)),
          minZ = Math.min(...upper.map((v) => v.z - v.d / 2)),
          maxZ = Math.max(...upper.map((v) => v.z + v.d / 2)),
          minY = Math.min(...upper.map((v) => v.y)),
          maxY = Math.max(...upper.map((v) => v.y + v.h));
        g.box(
          (minX + maxX) / 2,
          minY,
          (minZ + maxZ) / 2,
          maxX - minX,
          maxY - minY,
          maxZ - minZ,
          wall,
        );
      }
      geometry = g.finish();
    }
  }
  geometry.userData = { ...base.userData, assetId: model.id, lod };
  base.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
