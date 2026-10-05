import { createNoise2D } from 'simplex-noise';
import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { MAP_SIZE, SEA_LEVEL, TERRAIN_GENERATION, WORLD } from '../data/config';
import { MAP_PRESETS, TERRAIN } from '../data/terrain';
import type { Vec2 } from './types';
const size = WORLD.heightmapVertices,
  spacing = WORLD.heightmapSpacingM,
  half = MAP_SIZE / 2;
const smooth = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Seeded, centered-world height field; mutable edits belong to the future simulation worker. */
export class Terrain {
  readonly heights = new Float32Array(size * size);
  readonly river = new Float32Array(size);
  readonly riverWidth: number;
  readonly resources = {
    fertile: new Uint8Array(WORLD.fieldCells ** 2),
    forest: new Uint8Array(WORLD.fieldCells ** 2),
    ore: new Uint8Array(WORLD.fieldCells ** 2),
    oil: new Uint8Array(WORLD.fieldCells ** 2),
  };
  revision = 0;
  constructor(
    readonly seed: number,
    preset: (typeof MAP_PRESETS)[number] = MAP_PRESETS[0],
  ) {
    const rng = new Rng(seed),
      noise = createNoise2D(() => rng.next());
    const phase = rng.float(-Math.PI, Math.PI);
    this.riverWidth = rng.float(...TERRAIN_GENERATION.riverWidthM);
    // A descending guide channel guarantees drainage across the full map, without closed basins.
    for (let j = 0; j < size; j++) {
      const z = j * spacing - half;
      this.river[j] =
        TERRAIN.riverOffset +
        Math.sin(z / TERRAIN.riverWavelength + phase) * TERRAIN.riverAmplitude;
    }
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const x = i * spacing - half,
          z = j * spacing - half;
        let n = 0,
          amplitude = 1,
          frequency = TERRAIN_GENERATION.frequencyPerM,
          weight = 0;
        for (let o = 0; o < TERRAIN_GENERATION.octaves; o++) {
          n += noise(x * frequency, z * frequency) * amplitude;
          weight += amplitude;
          amplitude *= TERRAIN.noisePersistence;
          frequency *= TERRAIN.noiseLacunarity;
        }
        n /= weight;
        const edge = smooth(
          (Math.max(Math.abs(x), Math.abs(z)) - TERRAIN.centralRadius) /
            TERRAIN.transitionWidth,
        );
        const ridge =
          1 -
          Math.abs(
            noise(x / TERRAIN.ridgeScale + 17, z / TERRAIN.ridgeScale - 23),
          );
        const flat =
          TERRAIN.baseHeight +
          noise(x / TERRAIN.flatScale, z / TERRAIN.flatScale) *
            TERRAIN.centralNoise;
        let height =
          flat +
          edge *
            preset.relief *
            (TERRAIN.relief * (n + TERRAIN.reliefBias) +
              TERRAIN.ridgeHeight * ridge * ridge);
        if (preset.coast)
          height +=
            (SEA_LEVEL - TERRAIN.coastDepth - height) *
            smooth((x - (half - TERRAIN.coastWidth)) / TERRAIN.coastWidth);
        const distance = Math.abs(x - this.river[j]!);
        height =
          flat +
          (height - flat) *
            smooth(
              (distance - this.riverWidth / 2 - TERRAIN.bankWidth) /
                TERRAIN.valleyWidth,
            );
        const blend = smooth(
          (distance - this.riverWidth / 2) / TERRAIN.bankWidth,
        );
        const bed =
          SEA_LEVEL -
          TERRAIN.riverBedDepth -
          (j / (size - 1)) * TERRAIN.riverBedDrop;
        height = bed + (height - bed) * blend;
        this.heights[j * size + i] = clamp(height, ...WORLD.heightRangeM);
      }
    const oil = Array.from(
      { length: rng.int(...TERRAIN_GENERATION.oilClusters) },
      () => ({
        x: rng.float(-half, half),
        z: rng.float(-half, half),
        radius: rng.float(...TERRAIN.oilRadius),
      }),
    );
    for (let j = 0; j < WORLD.fieldCells; j++)
      for (let i = 0; i < WORLD.fieldCells; i++) {
        const x = i * spacing - half + spacing / 2,
          z = j * spacing - half + spacing / 2,
          index = j * WORLD.fieldCells + i;
        const h = this.heightAt(x, z),
          slope = this.slopeAt(x, z),
          dry = h > SEA_LEVEL;
        const waterDistance = Math.abs(x - this.river[j]!);
        this.resources.fertile[index] = dry
          ? Math.round(
              255 *
                (1 - clamp(slope / TERRAIN.fertileSlope, 0, 1)) *
                (1 - clamp(waterDistance / TERRAIN.fertileDistance, 0, 1)),
            )
          : 0;
        this.resources.forest[index] = dry
          ? Math.round(
              255 *
                clamp(
                  (noise(
                    x / TERRAIN.forestScale + 40,
                    z / TERRAIN.forestScale,
                  ) +
                    0.5) *
                    (1 - slope),
                  0,
                  1,
                ),
            )
          : 0;
        this.resources.ore[index] = dry
          ? Math.round(
              255 *
                clamp((h - TERRAIN.oreHeight) / TERRAIN.oreHeightRange, 0, 1),
            )
          : 0;
        let value = 0;
        for (const cluster of oil)
          value = Math.max(
            value,
            1 - Math.hypot(x - cluster.x, z - cluster.z) / cluster.radius,
          );
        this.resources.oil[index] = dry
          ? Math.round(255 * clamp(value, 0, 1))
          : 0;
      }
  }
  /** Bilinear height in metres, clamping coordinates at the map boundary. */
  heightAt(x: number, z: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(z))
      throw new RangeError('Invalid terrain coordinate');
    const fx = clamp((x + half) / spacing, 0, size - 1),
      fz = clamp((z + half) / spacing, 0, size - 1);
    const i = Math.min(size - 2, Math.floor(fx)),
      j = Math.min(size - 2, Math.floor(fz)),
      u = fx - i,
      v = fz - j;
    const a = this.heights[j * size + i]!,
      b = this.heights[j * size + i + 1]!,
      c = this.heights[(j + 1) * size + i]!,
      d = this.heights[(j + 1) * size + i + 1]!;
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  /** Rise/run gradient magnitude using central differences. */
  slopeAt(x: number, z: number): number {
    return (
      Math.hypot(
        this.heightAt(x + spacing / 2, z) - this.heightAt(x - spacing / 2, z),
        this.heightAt(x, z + spacing / 2) - this.heightAt(x, z - spacing / 2),
      ) / spacing
    );
  }
  /** Flatten vertices inside a polygon; increments revision so future editing tools can request a geometry rebuild. */
  flatten(polygon: readonly Vec2[], height: number): void {
    if (
      polygon.length < 3 ||
      !Number.isFinite(height) ||
      polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))
    )
      throw new RangeError('Invalid terrain edit');
    height = clamp(height, ...WORLD.heightRangeM);
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const x = i * spacing - half,
          z = j * spacing - half;
        let inside = false;
        for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
          const p = polygon[a]!,
            q = polygon[b]!;
          if (
            p.z > z !== q.z > z &&
            x < ((q.x - p.x) * (z - p.z)) / (q.z - p.z) + p.x
          )
            inside = !inside;
        }
        if (inside) this.heights[j * size + i] = height;
      }
    this.revision++;
  }
}
