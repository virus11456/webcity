import { BuildingGeometry } from './geometry';
import type { IndustrySpecializationId } from '../../data/policies';
import type { BuildingVolume } from '../../data/buildingAppearance';
import {
  BUILDING_PALETTE as P,
  ENVIRONMENT_PALETTE as E,
} from '../../data/palette';
export function industryGeometry(
  id: IndustrySpecializationId,
  width: number,
  depth: number,
  detail: boolean,
) {
  const g = new BuildingGeometry(detail),
    massing: BuildingVolume[] = [];
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    g.box(x, y, z, w, h, d, color);
    massing.push({ x, y, z, w, h, d, floors: 1 });
  };
  box(
    0,
    0,
    -depth / 2,
    width,
    0.1,
    depth,
    id === 'industry_farming' ? E.dirt : E.rock,
  );
  box(
    -width * 0.28,
    0.1,
    -depth * 0.7,
    width * 0.3,
    4,
    depth * 0.42,
    P.industrial.walls[2],
  );
  if (id === 'industry_farming') {
    for (let i = 0; i < 6; i++)
      box(
        width * 0.15,
        0.1,
        -depth * (0.15 + i * 0.13),
        width * 0.55,
        0.45,
        depth * 0.065,
        i % 2 ? E.grass : E.grass_dry,
      );
    g.roof(
      -width * 0.28,
      4.1,
      -depth * 0.7,
      width * 0.32,
      depth * 0.44,
      1.5,
      P.RL.roofs[1],
      false,
    );
  } else if (id === 'industry_forestry') {
    for (let i = 0; i < 4; i++)
      box(
        width * 0.16,
        0.1,
        -depth * (0.28 + i * 0.16),
        width * 0.52,
        1 + (i % 2),
        depth * 0.08,
        P.RL.accents[1],
      );
    for (const x of [-0.32, 0.34]) {
      g.cylinder(width * x, 0.1, -depth * 0.12, 0.25, 3, E.dirt);
      g.cylinder(width * x, 2, -depth * 0.12, 1.8, 3, E.grass_dark);
    }
  } else if (id === 'industry_ore') {
    for (let i = 0; i < 3; i++)
      box(
        width * 0.18,
        0.1 + i * 1.4,
        -depth * 0.5,
        width * (0.6 - i * 0.15),
        1.4,
        depth * (0.62 - i * 0.16),
        E.rock,
      );
    box(-width * 0.28, 4.1, -depth * 0.7, 1, 6, 1, P.industrial.accents[3]);
    box(0, 9, -depth * 0.7, width * 0.7, 0.7, 1, P.industrial.accents[3]);
  } else {
    box(width * 0.2, 0.1, -depth * 0.55, 1, 7, 1, P.industrial.walls[1]);
    box(
      width * 0.2,
      7.1,
      -depth * 0.55,
      width * 0.55,
      0.8,
      1,
      P.industrial.accents[3],
    );
    box(width * 0.43, 4.1, -depth * 0.55, 1, 3.8, 1, P.industrial.accents[3]);
    g.cylinder(
      -width * 0.28,
      0.1,
      -depth * 0.18,
      width * 0.12,
      3,
      P.industrial.accents[2],
    );
    massing.push({
      x: -width * 0.28,
      y: 0.1,
      z: -depth * 0.18,
      w: width * 0.24,
      h: 3,
      d: width * 0.24,
      floors: 1,
    });
  }
  const geometry = g.finish();
  geometry.userData = {
    massing,
    wall: P.industrial.walls[2],
    floors: 1,
    floorHeight: 4,
    industry: id,
  };
  return geometry;
}
