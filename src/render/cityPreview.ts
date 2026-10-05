import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { Rng } from '../core/rng';
import { SEA_LEVEL } from '../data/config';
import { CITY_PREVIEW } from '../data/terrain';
import {
  BUILDING_PALETTE as B,
  ENVIRONMENT_PALETTE as E,
  ROAD_PALETTE as R,
} from '../data/palette';
import type { Terrain } from '../world/terrain';
interface Part {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  rotate?: number;
}

/** Original display-only city diorama. No simulated population, finances or buildable world state. */
export class CityPreview {
  readonly group = new Group();
  readonly material = new MeshStandardMaterial({ roughness: 0.82 });
  readonly glass = new MeshStandardMaterial({
    roughness: 0.28,
    metalness: 0.2,
  });
  readonly buildingCount: number;
  private readonly meshes: InstancedMesh[] = [];
  constructor(terrain: Terrain) {
    const rng = new Rng(CITY_PREVIEW.seed),
      blocks: Part[] = [],
      windows: Part[] = [],
      roofs: Part[] = [],
      crowns: Part[] = [],
      trunks: Part[] = [];
    let count = 0;
    const box = (
      list: Part[],
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: string,
      rotate = 0,
    ): void => {
      list.push({ x, y: y + h / 2, z, w, h, d, color, rotate });
    };
    const tree = (x: number, z: number, scale = 1): void => {
      const y = terrain.heightAt(x, z);
      if (y < SEA_LEVEL + 3) return;
      box(
        trunks,
        x,
        y,
        z,
        0.7 * scale,
        5 * scale,
        0.7 * scale,
        B.RL.accents[1],
      );
      box(
        crowns,
        x,
        y + 3 * scale,
        z,
        5 * scale,
        8 * scale,
        5 * scale,
        rng.pick([E.grass_dark, R.median_grass, B.RL.accents[2]]),
      );
    };
    const road = (
      x1: number,
      z1: number,
      x2: number,
      z2: number,
      bridge = false,
    ): void => {
      const length = Math.hypot(x2 - x1, z2 - z1),
        horizontal = x1 !== x2;
      const pieces = Math.ceil(length / 12),
        dx = (x2 - x1) / pieces,
        dz = (z2 - z1) / pieces;
      for (let i = 0; i < pieces; i++) {
        const x = x1 + dx * (i + 0.5),
          z = z1 + dz * (i + 0.5),
          base = terrain.heightAt(x, z);
        const h = bridge ? Math.max(62, base + 0.4) : base + 0.4;
        if (!bridge && base < SEA_LEVEL + 3) continue;
        box(
          blocks,
          x,
          h,
          z,
          horizontal ? Math.abs(dx) + 0.1 : 22,
          0.4,
          horizontal ? 22 : Math.abs(dz) + 0.1,
          R.sidewalk,
        );
        box(
          blocks,
          x,
          h + 0.4,
          z,
          horizontal ? Math.abs(dx) + 0.1 : 16,
          0.08,
          horizontal ? 16 : Math.abs(dz) + 0.1,
          R.asphalt,
        );
        // Stop lane markings before perpendicular streets to leave clear intersections.
        const crossing = (
          horizontal ? CITY_PREVIEW.streetX : CITY_PREVIEW.streetZ
        ).some((v) => Math.abs((horizontal ? x : z) - v) < 15);
        if (!crossing)
          box(
            blocks,
            x,
            h + 0.5,
            z,
            horizontal ? 4 : 0.3,
            0.03,
            horizontal ? 0.3 : 4,
            R.lane_white,
          );
        if (bridge && base < 50 && i % 4 === 0) {
          box(blocks, x, SEA_LEVEL - 2, z - 7, 3, h - SEA_LEVEL + 2, 3, R.curb);
          box(blocks, x, SEA_LEVEL - 2, z + 7, 3, h - SEA_LEVEL + 2, 3, R.curb);
        }
      }
    };
    for (const x of CITY_PREVIEW.streetX) road(x, -420, x, 420);
    for (const z of CITY_PREVIEW.streetZ) road(-500, z, 280, z);
    road(280, 0, 680, 0, true);
    road(680, -320, 680, 320);
    road(-680, 240, -440, 240);
    // Crosswalks, street trees and lamps make the road scale readable from above.
    for (const x of CITY_PREVIEW.streetX)
      for (const z of CITY_PREVIEW.streetZ) {
        const y = terrain.heightAt(x, z) + 1;
        if (y < SEA_LEVEL + 4) continue;
        for (let stripe = -6; stripe <= 6; stripe += 3) {
          box(blocks, x + stripe, y, z + 12, 1.4, 0.02, 4, R.lane_white);
          box(blocks, x + 12, y, z + stripe, 4, 0.02, 1.4, R.lane_white);
        }
        tree(x + 17, z + 17);
        tree(x - 17, z - 17);
        box(blocks, x + 12, y, z - 17, 0.5, 8, 0.5, B.RH.accents[0]);
        box(blocks, x + 11, y + 7.5, z - 17, 3, 0.5, 1, B.RL.accents[0]);
      }
    for (let ix = 0; ix < CITY_PREVIEW.streetX.length - 1; ix++)
      for (let iz = 0; iz < CITY_PREVIEW.streetZ.length - 1; iz++) {
        const x0 = CITY_PREVIEW.streetX[ix]! + 30,
          z0 = CITY_PREVIEW.streetZ[iz]! + 30;
        // Reserve a full riverfront block as a public garden.
        if (ix === 5 && (iz === 2 || iz === 3)) {
          const y = terrain.heightAt(x0 + 25, z0 + 25);
          box(blocks, x0 + 28, y + 0.3, z0 + 28, 80, 0.15, 5, R.sidewalk);
          box(blocks, x0 + 28, y + 0.3, z0 + 28, 5, 0.15, 80, R.sidewalk);
          for (let t = 0; t < 14; t++)
            tree(
              x0 + rng.float(-8, 70),
              z0 + rng.float(-8, 70),
              rng.float(0.9, 1.3),
            );
          continue;
        }
        for (let a = 0; a < 3; a++)
          for (let b = 0; b < 3; b++) {
            const x = x0 + a * 30,
              z = z0 + b * 30,
              y = terrain.heightAt(x, z);
            if (y < SEA_LEVEL + 4 || terrain.slopeAt(x, z) > 0.12) continue;
            const downtown = ix >= 2 && ix <= 4 && iz >= 1 && iz <= 4;
            const office = downtown && (ix + iz + a) % 3 === 0;
            const home = ix < 2 || iz === 5;
            const height = home
              ? rng.int(1, 2) * 3
              : downtown
                ? rng.int(5, office ? 20 : 12) * 4
                : rng.int(1, 3) * 4;
            const w = home ? rng.float(13, 19) : rng.float(19, 25),
              d = home ? rng.float(14, 20) : rng.float(18, 25);
            const walls = home
              ? rng.pick(B.RL.walls)
              : office
                ? rng.pick(B.office.walls)
                : rng.pick(B.RH.walls);
            box(
              blocks,
              x,
              y + 0.1,
              z,
              27,
              0.3,
              27,
              home ? B.RL.accents[2] : R.sidewalk,
            );
            box(blocks, x, y + 0.5, z, w, height, d, walls);
            count++;
            if (home) {
              box(
                roofs,
                x,
                y + height + 0.5,
                z,
                w + 1.2,
                4,
                d + 1.2,
                rng.pick(B.RL.roofs),
                Math.PI / 4,
              );
              box(blocks, x - w / 3, y + height + 2, z, 2, 3, 2, B.RL.walls[2]);
              tree(x + 11, z + 10, 0.7);
            } else {
              box(
                blocks,
                x,
                y + height + 0.5,
                z,
                w + 0.6,
                0.7,
                d + 0.6,
                B.RH.roofs[0],
              );
              box(blocks, x - 4, y + height + 1.2, z, 5, 2, 5, B.RH.roofs[1]);
              if (office && height > 50)
                box(
                  blocks,
                  x + 3,
                  y + height + 1,
                  z,
                  0.6,
                  12,
                  0.6,
                  B.office.accents[1],
                );
            }
            const floors = Math.floor(height / (home ? 3 : 4));
            for (let floor = 0; floor < floors; floor++) {
              const wy = y + 1.8 + floor * (home ? 3 : 4);
              for (const side of [-1, 1]) {
                box(
                  windows,
                  x,
                  wy,
                  z + side * (d / 2 + 0.03),
                  w * 0.78,
                  home ? 1.2 : 1.8,
                  0.08,
                  B.RH.accents[1],
                );
                box(
                  windows,
                  x + side * (w / 2 + 0.03),
                  wy,
                  z,
                  0.08,
                  home ? 1.2 : 1.8,
                  d * 0.78,
                  B.RH.accents[1],
                );
              }
            }
            // Uprights subdivide the window ribbons into a facade grid.
            for (const offset of [-0.3, 0, 0.3]) {
              box(
                blocks,
                x + w * offset,
                y + 0.5,
                z + d / 2 + 0.1,
                0.5,
                height,
                0.25,
                walls,
              );
              box(
                blocks,
                x + w / 2 + 0.1,
                y + 0.5,
                z + d * offset,
                0.25,
                height,
                0.5,
                walls,
              );
            }
            if (!home && !downtown)
              box(
                blocks,
                x,
                y + 3,
                z + d / 2 + 1,
                w,
                0.5,
                3,
                rng.pick(B.commercial.accents),
              );
          }
      }
    for (let i = 0; i < CITY_PREVIEW.treeCount; i++) {
      const x = rng.float(-1700, 1700),
        z = rng.float(-1700, 1700);
      if (x > -530 && x < 750 && z > -450 && z < 450) continue;
      if (terrain.slopeAt(x, z) < 0.5) tree(x, z, rng.float(0.8, 1.5));
    }
    // Parked display vehicles, without pretending to simulate traffic.
    for (const z of CITY_PREVIEW.streetZ)
      for (let x = -400; x < 240; x += 54) {
        const y = terrain.heightAt(x, z);
        if (y < SEA_LEVEL + 4) continue;
        box(
          blocks,
          x,
          y + 1,
          z + 5,
          4.5,
          1.5,
          1.8,
          rng.pick(B.commercial.accents),
        );
        box(windows, x, y + 2.1, z + 5, 2.1, 0.6, 1.7, B.office.walls[2]);
      }
    this.buildingCount = count;
    this.batch(blocks, new BoxGeometry(1, 1, 1), this.material);
    this.batch(windows, new BoxGeometry(1, 1, 1), this.glass);
    // radius sqrt(1/2) makes a unit square after the 45-degree roof rotation.
    this.batch(roofs, new ConeGeometry(Math.SQRT1_2, 1, 4), this.material);
    this.batch(trunks, new CylinderGeometry(0.5, 0.5, 1, 5), this.material);
    this.batch(crowns, new IcosahedronGeometry(0.65, 0), this.material);
  }
  private batch(
    parts: Part[],
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
  ): void {
    const mesh = new InstancedMesh(geometry, material, parts.length),
      pose = new Object3D(),
      color = new Color();
    parts.forEach((p, i) => {
      pose.position.set(p.x, p.y, p.z);
      pose.scale.set(p.w, p.h, p.d);
      pose.rotation.y = p.rotate ?? 0;
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
      mesh.setColorAt(i, color.set(p.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.meshes.push(mesh);
    this.group.add(mesh);
  }
  /** Dispose shared instancing buffers, geometry and materials. */
  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.material.dispose();
    this.glass.dispose();
    this.group.clear();
  }
}
