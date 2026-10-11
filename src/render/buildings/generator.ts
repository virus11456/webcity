import { industryGeometry } from './industryGeometry';
import type { IndustrySpecializationId } from '../../data/policies';
import type { BufferGeometry } from 'three';
import { Rng } from '../../core/rng';
import { CELL_SIZE } from '../../data/config';
import {
  BUILDING_FORM as F,
  type BuildingSpec,
  type BuildingVolume,
} from '../../data/buildingAppearance';
import {
  BUILDING_PALETTE as P,
  BUILDING_DETAIL_PALETTE as D,
  ENVIRONMENT_PALETTE as E,
} from '../../data/palette';
import { ZONES, type ZoneType } from '../../data/zones';
import { BuildingGeometry } from './geometry';

/** Deterministic original architecture; origin is the front-center lot edge, +Z faces the street. */
export function generateBuilding(
  zone: ZoneType,
  level: number,
  w: number,
  d: number,
  seed: number,
  detail = true,
  maxFloors = Infinity,
  industry?: IndustrySpecializationId,
): BufferGeometry {
  const rules = ZONES[zone];
  if (
    !rules ||
    ![level, w, d, seed].every(Number.isSafeInteger) ||
    level < 1 ||
    level > rules.maxLevel ||
    w < rules.lotWidthCells[0] ||
    w > rules.lotWidthCells[1] ||
    d < rules.lotDepthCells[0] ||
    d > rules.lotDepthCells[1]
  )
    throw new RangeError('Invalid building specification');
  if (zone === 'I' && industry)
    return industryGeometry(industry, w * CELL_SIZE, d * CELL_SIZE, detail);
  const rng = new Rng(seed),
    g = new BuildingGeometry(detail),
    width = w * CELL_SIZE,
    depth = d * CELL_SIZE;
  const range = F.floors[zone][level - 1]!,
    floors = Math.min(maxFloors, rng.int(range[0], range[1]));
  const floorHeight = zone === 'I' && level > 1 ? 10 : F.floorHeight[zone],
    height = floors * floorHeight;
  const palette =
    zone === 'RL'
      ? P.RL
      : zone === 'RH'
        ? P.RH
        : zone === 'I'
          ? P.industrial
          : zone === 'O'
            ? P.office
            : P.commercial;
  // Consecutive seeds cycle palettes; a future street allocator can assign distinct neighbor seeds.
  const wall = palette.walls[(seed >>> 0) % palette.walls.length]!,
    roof = rng.pick(palette.roofs),
    variant = rng.int(0, F.windowVariants - 1);
  const front = zone === 'RL' ? F.residentialFront : F.frontSetback;
  const bw = width - F.sideSetback * 2,
    bd = depth - front - F.sideSetback,
    z = -(front + bd / 2);
  g.box(
    0,
    0,
    -depth / 2,
    width,
    0.08,
    depth,
    zone === 'RL' ? P.RL.accents[2] : D.concrete,
  );
  const massing: BuildingVolume[] = [];
  const box = (
    x: number,
    y: number,
    cz: number,
    bw: number,
    h: number,
    bd: number,
    n: number,
    style = zone,
  ) => {
    massing.push({ x, y, z: cz, w: bw, h, d: bd, floors: n });
    g.box(x, y, cz, bw, h, bd, wall, roof, n, style, variant);
  };
  const equipment = (y: number) =>
    g.box(bw * 0.2, y, z, bw * 0.2, 0.8, Math.min(2, bd * 0.25), P.RH.roofs[1]);
  const parapet = (
    y: number,
    x: number,
    cz: number,
    sw: number,
    sd: number,
  ) => {
    for (const side of [-1, 1]) {
      g.box(x, y, cz + side * (sd / 2 - 0.15), sw, 0.45, 0.3, roof);
      g.box(x + side * (sw / 2 - 0.15), y, cz, 0.3, 0.45, sd, roof);
    }
  };
  if (zone === 'RL') {
    box(0, 0.08, z, bw, height, bd, floors);
    g.roof(
      0,
      height + 0.08,
      z,
      bw + F.roofOverhang * 2,
      bd + F.roofOverhang * 2,
      F.roofRise,
      rng.pick(P.RL.roofs),
      rng.next() > 0.5,
    );
    // Door, supported porch and path in the front yard; a garage fits on wider lots.
    g.box(0, 0.08, -front + 0.03, 1, 2, 0.12, P.RL.accents[1]);
    g.box(0, 0.1, -front / 2, 1.2, 0.08, front, D.concrete);
    g.box(0, 2.3, -front + 0.75, 2.2, 0.18, 1.5, roof);
    for (const x of [-0.9, 0.9])
      g.box(x, 0, -front + 1.3, 0.12, 2.3, 0.12, P.RL.accents[0]);
    if (w === 2) {
      g.box(bw / 2 - 1.8, 0.08, -front + 0.8, 3, 2.5, 2, wall, roof);
      g.box(bw / 2 - 1.8, 0.08, -front + 1.83, 2.3, 2, 0.1, D.frame);
    }
    // Compact garden trees stay inside even a 1×1 parcel.
    for (const x of [-width / 2 + 0.65, width / 2 - 0.65]) {
      g.cylinder(x, 0.08, -depth + 0.65, 0.1, 1.5, P.RL.accents[1]);
      g.cylinder(x, 1.2, -depth + 0.65, 0.6, 1.2, E.grass_dark);
    }
  } else if (zone === 'RH') {
    const podium = floors > 6 ? 2 : 1,
      tw = bw * 0.82,
      td = bd * 0.85;
    box(0, 0.08, z, bw, podium * floorHeight, bd, podium);
    box(
      0,
      podium * floorHeight + 0.08,
      z,
      tw,
      height - podium * floorHeight,
      td,
      floors - podium,
    );
    for (let f = podium + 1; f <= floors; f += 2)
      g.box(
        0,
        f * floorHeight - 0.2,
        z + td / 2 + 0.18,
        tw,
        0.2,
        0.6,
        P.RH.accents[0],
      );
    parapet(height + 0.08, 0, z, tw, td);
    equipment(height + 0.08);
    if (level >= 3)
      g.cylinder(-tw * 0.25, height + 0.08, z, 1, 2, P.RH.roofs[1]);
  } else if (zone === 'CL') {
    box(0, 0.08, z, bw, height, bd, floors);
    g.box(
      0,
      0.08,
      -front + 0.04,
      bw * 0.85,
      2.6,
      0.1,
      D.frame,
      D.frame,
      1,
      'CL',
      2,
    );
    g.box(
      0,
      2.8,
      -front + 0.65,
      bw,
      0.22,
      1.2,
      rng.pick(P.commercial.accents.slice(0, 4)),
    );
    g.box(
      0,
      3.15,
      -front + 0.08,
      bw * 0.65,
      0.65,
      0.2,
      P.commercial.accents[4],
    );
    parapet(height + 0.08, 0, z, bw, bd);
    equipment(height + 0.08);
  } else if (zone === 'CH') {
    const podium = Math.min(2, floors - 1),
      base = podium * floorHeight;
    box(0, 0.08, z, bw, base, bd, podium);
    const two = w >= 3 && rng.next() > 0.4;
    for (const sign of two ? [-1, 1] : [0]) {
      const tw = bw * (two ? 0.38 : 0.7),
        td = bd * 0.7,
        x = sign * bw * 0.25;
      box(x, base + 0.08, z, tw, height - base, td, floors - podium);
      parapet(height + 0.08, x, z, tw, td);
    }
    g.box(
      0,
      base - 1.2,
      -front + 0.15,
      bw * 0.8,
      1,
      0.3,
      rng.pick(P.commercial.accents.slice(0, 4)),
    );
    g.box(0, 2.8, -front + 0.6, bw, 0.25, 1, P.commercial.accents[2]);
    equipment(height + 0.08);
  } else if (zone === 'I') {
    const fw = bw * 0.73,
      x = -bw * 0.135,
      teeth = 3,
      tooth = bd / teeth;
    box(x, 0.08, z, fw, height, bd, floors);
    for (let i = 0; i < teeth; i++) {
      const a = -front - i * tooth,
        b = a - tooth;
      g.quad(
        [x - fw / 2, height, a],
        [x + fw / 2, height, a],
        [x + fw / 2, height + 2, b],
        [x - fw / 2, height + 2, b],
        roof,
      );
      g.quad(
        [x - fw / 2, height, b],
        [x - fw / 2, height + 2, b],
        [x + fw / 2, height + 2, b],
        [x + fw / 2, height, b],
        D.glass,
      );
      g.box(x, height + 2, b, fw, 0.12, 0.16, P.industrial.walls[1]);
      g.triangle(
        [x - fw / 2, height, a],
        [x - fw / 2, height + 2, b],
        [x - fw / 2, height, b],
        wall,
      );
      g.triangle(
        [x + fw / 2, height, b],
        [x + fw / 2, height + 2, b],
        [x + fw / 2, height, a],
        wall,
      );
    }
    if (level >= 2) {
      const h = rng.int(F.chimneyHeight[0], F.chimneyHeight[1]),
        cx = bw * 0.39;
      for (let i = 0; i < 5; i++)
        g.cylinder(
          cx,
          (i * h) / 5,
          -depth + 2,
          0.55,
          h / 5,
          P.industrial.accents[i % 2]!,
        );
    }
    if (level >= 3)
      g.cylinder(
        bw * 0.38,
        0,
        -front - 3,
        bw * 0.1,
        5,
        P.industrial.accents[2],
      );
    g.box(x, 0.08, -front + 0.45, fw * 0.6, 0.6, 0.8, D.concrete);
    g.box(x, 0.7, -front + 0.04, fw * 0.4, 3, 0.15, D.frame);
  } else {
    let y = 0.08,
      remaining = floors;
    for (let tier = 0; tier < 3; tier++) {
      const n = tier === 2 ? remaining : Math.floor(floors / 3),
        scale = 1 - tier * 0.16;
      box(0, y, z, bw * scale, n * floorHeight, bd * scale, n);
      y += n * floorHeight;
      remaining -= n;
      parapet(y, 0, z, bw * scale, bd * scale);
    }
    g.box(0, y, z, 0.25, 4, 0.25, P.office.accents[1]);
    g.box(bw * 0.18, y, z, bw * 0.2, 0.1, bd * 0.25, P.office.accents[0]);
  }
  const geometry = g.finish();
  geometry.userData = {
    spec: { zone, level, w, d, seed } satisfies BuildingSpec,
    massing,
    floors,
    floorHeight,
    wall,
    variant,
    triangles: geometry.getAttribute('position').count / 3,
  };
  return geometry;
}
