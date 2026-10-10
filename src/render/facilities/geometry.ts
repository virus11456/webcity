import { BufferGeometry, Matrix4 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BuildingGeometry } from '../buildings/geometry';
import {
  BUILDING_PALETTE as B,
  BUILDING_DETAIL_PALETTE as P,
  ROAD_PALETTE as R,
  ENVIRONMENT_PALETTE as E,
  SERVICE_PALETTE as S,
} from '../../data/palette';
import { POWER } from '../../data/power';
import type { FacilityModel } from '../../world/facilityModels';
/** Front-centre origin, +Z street; authored geometry doubles as the offline source. */
export function facilityGeometry(
  m: FacilityModel,
  lod: 0 | 1 | 2,
): BufferGeometry {
  const g = new BuildingGeometry(),
    w = m.w * 8,
    d = m.d * 8,
    id = m.defId;
  const box = (
    x: number,
    y: number,
    z: number,
    a: number,
    h: number,
    b: number,
    color: string,
    windows = false,
  ) =>
    g.box(
      x,
      y,
      z,
      a,
      h,
      b,
      color,
      color,
      windows ? Math.max(1, Math.floor(h / 3)) : 1,
      windows ? 'RH' : undefined,
    );
  const tree = (x: number, z: number, height = 9) => {
    g.cylinder(x, 0, z, 0.35, height * 0.5, R.tree_trunk);
    g.cylinder(x, height * 0.35, z, 2, height * 0.42, R.tree_leaf);
    g.cylinder(x, height * 0.7, z, 1.3, height * 0.3, E.grass_dark);
  };
  if (id === 'tree') {
    if (lod === 0) tree(0, -d / 2);
    else box(0, 0, -d / 2, 4, 9, 4, R.tree_leaf);
    return g.finish();
  }
  const concrete = P.concrete,
    pale = B.RH.walls[3],
    dark = B.industrial.roofs[0],
    glass = B.office.walls[0];
  if (lod === 2) {
    const tall =
      id === 'power_wind'
        ? POWER.rotorHeightM
        : id === 'water_tower'
          ? 29
          : m.landmark !== undefined
            ? 28
            : id === 'hospital'
              ? 24
              : 12;
    box(
      0,
      0,
      -d / 2,
      w * 0.82,
      tall,
      d * 0.75,
      m.definition?.kind === 'park' ? R.median_grass : pale,
    );
    return g.finish();
  }
  box(
    0,
    0,
    -d / 2,
    w,
    0.2,
    d,
    m.definition?.kind === 'park' || id === 'cemetery'
      ? R.median_grass
      : concrete,
  );
  if (id === 'power_wind') {
    g.cylinder(0, 0.2, -d / 2, 1.1, POWER.rotorHeightM, pale);
    box(0, POWER.rotorHeightM - 1.5, -d / 2, 3, 3, 5, pale);
  } else if (id === 'power_solar') {
    for (let z = 0; z < (lod === 0 ? 4 : 2); z++)
      for (let x = 0; x < 4; x++) {
        box(
          (x - 1.5) * w * 0.21,
          0.2,
          -d * (0.18 + z * (lod === 0 ? 0.21 : 0.55)),
          0.4,
          1.5,
          0.4,
          dark,
        );
        box(
          (x - 1.5) * w * 0.21,
          1.7,
          -d * (0.18 + z * (lod === 0 ? 0.21 : 0.55)),
          w * 0.19,
          0.25,
          d * 0.17,
          glass,
        );
      }
  } else if (id === 'power_hydro') {
    box(0, 0.2, -d * 0.65, w * 0.95, 16, d * 0.23, concrete);
    box(0, 16.2, -d * 0.65, w, 1.2, d * 0.28, pale);
    for (let x = -3; x <= 3; x++)
      box((x * w) / 8, 0.2, -d * 0.45, w * 0.04, 16, d * 0.22, dark);
    box(w * 0.3, 0.2, -d * 0.2, w * 0.2, 8, d * 0.24, B.industrial.walls[1]);
  } else if (
    id === 'power_coal' ||
    id === 'power_oil' ||
    id === 'garbage_incinerator'
  ) {
    box(
      -w * 0.12,
      0.2,
      -d * 0.5,
      w * 0.58,
      12,
      d * 0.64,
      B.industrial.walls[1],
      lod === 0,
    );
    box(-w * 0.12, 12.2, -d * 0.5, w * 0.62, 0.6, d * 0.68, dark);
    for (const x of [-w * 0.25, w * 0.25]) {
      g.cylinder(x, 0.2, -d * 0.85, 1.4, 28, B.industrial.accents[0]);
      g.cylinder(x, 24, -d * 0.85, 1.45, 3, pale);
    }
    if (id === 'power_oil')
      for (const z of [-d * 0.3, -d * 0.65])
        g.cylinder(w * 0.32, 0.2, z, w * 0.1, 8, B.industrial.accents[2]);
  } else if (id === 'water_tower') {
    for (const x of [-4, 4])
      for (const z of [-4, -12]) g.cylinder(x, 0.2, z, 0.6, 21, concrete);
    g.cylinder(0, 21, -d / 2, 6, 8, glass);
    g.cylinder(0, 29, -d / 2, 6.3, 0.6, pale);
  } else if (id === 'water_treatment') {
    box(-w * 0.3, 0.2, -d / 2, w * 0.28, 8, d * 0.8, pale, lod === 0);
    for (const z of [-d * 0.25, -d * 0.75]) {
      g.cylinder(w * 0.2, 0.2, z, w * 0.18, 2, concrete);
      g.cylinder(w * 0.2, 2.2, z, w * 0.15, 0.3, E.water_shallow);
      box(w * 0.2, 2.5, z, w * 0.36, 0.18, 0.3, dark);
    }
  } else if (id === 'water_pump' || id === 'water_drain') {
    box(
      0,
      0.2,
      -d * 0.6,
      w * 0.75,
      id === 'water_pump' ? 7 : 4,
      d * 0.6,
      pale,
      lod === 0,
    );
    box(
      0,
      id === 'water_pump' ? 7.2 : 4.2,
      -d * 0.6,
      w * 0.8,
      0.5,
      d * 0.65,
      glass,
    );
  } else if (id === 'garbage_landfill') {
    for (let i = 0; i < 3; i++)
      box(
        (i - 1) * w * 0.25,
        0.2,
        -d * 0.6,
        w * 0.22,
        2 + i,
        d * 0.5,
        i % 2 ? E.dirt : E.rock,
      );
    box(-w * 0.3, 0.2, -d * 0.13, w * 0.25, 3.4, d * 0.14, pale);
  } else if (id === 'garbage_recycling') {
    box(
      0,
      0.2,
      -d * 0.6,
      w * 0.8,
      9,
      d * 0.62,
      B.industrial.walls[1],
      lod === 0,
    );
    for (let i = -1; i <= 1; i++)
      box(
        i * w * 0.24,
        0.2,
        -d * 0.16,
        w * 0.18,
        2.5,
        d * 0.12,
        [B.commercial.accents[1], glass, B.industrial.accents[3]][i + 1]!,
      );
  } else if (id === 'cemetery') {
    box(0, 0.2, -d / 2, 2, 0.1, d, pale);
    box(0, 0.2, -d / 2, w, 0.1, 2, pale);
    for (const side of [-1, 1])
      for (let row = 0; row < (lod === 0 ? 5 : 2); row++)
        for (let col = 1; col <= 2; col++) {
          const z = -d * (0.15 + row * (lod === 0 ? 0.16 : 0.6)),
            x = side * col * w * 0.17;
          box(x, 0.2, z, 1, 1, 0.3, B.RH.walls[0]);
        }
    box(0, 0.2, -d * 0.86, w * 0.22, 5, d * 0.18, pale);
    g.roof(0, 5.2, -d * 0.86, w * 0.24, d * 0.2, 2, B.RL.roofs[2], false);
  } else if (id === 'crematorium') {
    box(0, 0.2, -d * 0.56, w * 0.7, 7, d * 0.65, B.RH.walls[0], lod === 0);
    g.roof(0, 7.2, -d * 0.56, w * 0.75, d * 0.68, 2, B.RL.roofs[0], true);
    g.cylinder(w * 0.27, 0.2, -d * 0.8, 0.8, 14, dark);
    box(0, 0.2, -1.5, 3, 0.15, 3, pale);
  } else if (m.definition?.kind === 'park') {
    box(0, 0.2, -d / 2, 2, 0.15, d, R.sidewalk);
    box(0, 0.2, -d / 2, w, 0.15, 2, R.sidewalk);
    if (lod === 0)
      for (const x of [-w * 0.3, w * 0.3])
        for (const z of [-d * 0.2, -d * 0.8]) tree(x, z);
    if (id === 'park_playground') {
      box(w * 0.2, 0.2, -d * 0.6, 2, 3, 2, B.commercial.accents[3]);
      box(w * 0.2, 1, -d * 0.4, 1, 0.4, 4, B.commercial.accents[2]);
    }
    if (id === 'park_plaza' || id === 'park_large') {
      g.cylinder(0, 0.2, -d / 2, w * 0.16, 0.5, pale);
      g.cylinder(0, 0.7, -d / 2, w * 0.13, 0.1, E.water_shallow);
    }
    if (lod === 0)
      for (const x of [-w * 0.2, w * 0.2])
        box(x, 0.6, -d * 0.4, 3, 0.4, 1, R.tree_trunk);
  } else if (m.landmark !== undefined) {
    const n = m.landmark;
    if (n === 3) {
      // Stadium ring and playing field.
      box(0, 0.2, -d / 2, w * 0.55, 0.1, d * 0.55, R.median_grass);
      for (const x of [-1, 1])
        box(x * w * 0.36, 0.2, -d / 2, w * 0.16, 9, d * 0.8, pale);
      for (const z of [-0.15, -0.85])
        box(0, 0.2, z * d, w * 0.86, 9, d * 0.12, pale);
    } else if ([4, 9, 10, 11].includes(n)) {
      const h = [30, 20, 35, 65][[4, 9, 10, 11].indexOf(n)]!;
      g.cylinder(
        0,
        0.2,
        -d / 2,
        n === 9 ? 3 : 4,
        h,
        n === 10 ? B.industrial.accents[0] : pale,
      );
      g.cylinder(0, h, -d / 2, n === 11 ? 9 : 5, 4, glass);
      if (n === 10) {
        for (const y of [8, 18, 28]) g.cylinder(0, y, -d / 2, 4.04, 4, pale);
        g.cylinder(0, h - 0.6, -d / 2, 5.8, 0.6, dark);
        g.roof(0, h + 4, -d / 2, 10, 10, 3, dark, true);
      }
      if (n === 9) {
        box(0, 0.2, -d / 2, 10, 1.5, 10, B.RH.walls[0]);
        g.roof(0, h + 4, -d / 2, 6, 6, 5, pale, true);
      }
      if (n === 4) {
        box(0, h + 4, -d / 2, 5, 4, 5, B.RL.roofs[2]);
        box(0, h + 4.5, -d / 2 + 2.6, 2, 2, 0.15, pale);
      }
    } else if (n === 2 || n === 8) {
      box(0, 0.2, -d / 2, w * 0.7, 8, d * 0.6, pale, lod === 0);
      for (const side of n === 2 ? [0] : [-1, 1])
        for (let tier = 0; tier < 3; tier++)
          g.cylinder(
            side * w * 0.2,
            8 + tier * 3,
            -d / 2,
            w * ((n === 2 ? 0.29 : 0.18) - tier * 0.045),
            3,
            B.office.walls[1],
          );
    } else if (n === 5) {
      box(0, 0.2, -d / 2, w * 0.75, 5, d * 0.7, glass, lod === 0);
      for (let i = -1; i <= 1; i++)
        g.roof(i * w * 0.25, 5.2, -d / 2, w * 0.25, d * 0.7, 4, glass, false);
      for (let i = -3; i <= 3; i++)
        box(i * w * 0.12, 0.2, -d * 0.15, 0.2, 5, 0.2, pale);
    } else if (n === 7) {
      for (let i = 0; i < 3; i++)
        g.roof(
          (i - 1) * w * 0.23,
          5,
          -d / 2,
          w * 0.24,
          d * 0.7,
          13,
          pale,
          false,
        );
      box(0, 0.2, -d / 2, w * 0.86, 5, d * 0.8, B.RH.walls[0]);
    } else {
      box(0, 0.2, -d * 0.58, w * 0.8, 13, d * 0.6, pale, lod === 0);
      box(0, 13.2, -d * 0.58, w * 0.86, 1, d * 0.66, B.RL.roofs[n % 4]!);
      for (let x = -2; x <= 2; x++)
        g.cylinder(x * w * 0.14, 0.2, -d * 0.22, 0.8, 13, pale);
      if (n === 0)
        g.roof(0, 14.2, -d * 0.58, w * 0.5, d * 0.5, 6, B.RL.roofs[0], true);
      if (n === 6) box(0, 14.2, -d * 0.58, w * 0.65, 3, d * 0.4, glass);
    }
  } else {
    const service = m.definition?.service,
      color =
        service === 'police'
          ? S.police
          : service === 'fire'
            ? S.fire
            : service === 'health'
              ? S.health
              : service === 'education'
                ? S.education
                : B.RH.walls[0];
    const h =
      id === 'hospital'
        ? 24
        : id === 'university' || id.endsWith('_hq')
          ? 15
          : 9;
    box(0, 0.2, -d * 0.58, w * 0.82, h, d * 0.64, color, lod === 0);
    box(0, h + 0.2, -d * 0.58, w * 0.86, 0.7, d * 0.68, dark);
    box(0, 3.5, -d * 0.18, w * 0.4, 0.3, 3, pale);
    if (service === 'fire' || id === 'bus_depot')
      for (let x = -1; x <= 1; x++)
        box(x * w * 0.25, 0.2, -d * 0.25, w * 0.2, 4, 0.25, dark);
    if (service === 'health') {
      box(w * 0.28, h * 0.6, -d * 0.252, 1, 4, 0.3, S.fire);
      box(w * 0.28, h * 0.6 + 1.5, -d * 0.248, 3, 1, 0.3, S.fire);
    }
    if (service === 'police') {
      box(w * 0.25, h * 0.65, -d * 0.25, 2, 2, 0.3, pale);
      g.cylinder(-w * 0.25, h + 0.9, -d * 0.7, 0.12, 5, B.office.accents[1]);
    }
    if (service === 'education') {
      box(0, 0.2, -d * 0.1, w * 0.65, 0.2, d * 0.13, R.median_grass);
      if (id === 'university')
        g.roof(0, h + 0.9, -d * 0.58, w * 0.5, d * 0.4, 4, B.RL.roofs[2], true);
    }
    if (id === 'metro_station') {
      box(0, 0.3, -d * 0.13, w * 0.35, 0.2, d * 0.25, dark);
      box(w * 0.3, 0.2, -d * 0.15, 0.2, 5, 0.2, pale);
      box(w * 0.3, 4.2, -d * 0.15, 2, 1, 0.3, S.police);
    }
  }
  const result = g.finish();
  result.userData = { assetId: m.id, lod };
  return result;
}
/** Separate rotor pivot allows the formal wind turbine to retain its wind-driven animation. */
export function facilityRotor(lod: 0 | 1): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new BuildingGeometry();
    g.box(
      0,
      0,
      0,
      lod === 0 ? 1.1 : 1.4,
      POWER.rotorRadiusM,
      0.5,
      B.RH.walls[3],
    );
    const p = g.finish();
    p.applyMatrix4(new Matrix4().makeRotationZ((i * Math.PI * 2) / 3));
    parts.push(p);
  }
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return merged;
}
