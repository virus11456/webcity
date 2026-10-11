import { industryDefinition } from '../../world/industry';
import { MAP_SIZE, TIME } from '../../data/config';
import { ENVIRONMENT as E } from '../../data/environment';
import { PARKS } from '../../data/parks';
import { ROADS } from '../../data/roads';
import { POWER } from '../../data/power';
import { closestPointOnSegment } from '../../core/math';
import { sampleRoad } from '../../world/roadProfile';
import { fieldIndex } from '../../world/fieldSampling';
import { intakePoint, waterDefinition } from '../../world/waterUtility';
import { zoneBuildingFootprint } from '../../world/zoneGeometry';
import { parkDefinition } from '../../world/parks';
import { parkField } from './parks';
import type { Building, Vec2 } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
const clamp = (v: number) => Math.max(0, Math.min(E.maxValue, v));
const center = (b: Building): Vec2 => {
  const q = zoneBuildingFootprint(b);
  return q.reduce(
    (p, v) => ({ x: p.x + v.x / q.length, z: p.z + v.z / q.length }),
    { x: 0, z: 0 },
  );
};
/** An absent edge neighbor reflects its share back into the source cell, conserving diffusion mass. */
export function diffusePollution(
  source: Float32Array,
  size: number,
  emissions = new Float32Array(source.length),
): Float32Array {
  const next = new Float32Array(source.length);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      let neighbors = 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          neighbors +=
            source[
              z + dz < 0 || z + dz >= size || x + dx < 0 || x + dx >= size
                ? i
                : (z + dz) * size + x + dx
            ]!;
        }
      next[i] = clamp(
        (source[i]! * (1 - E.diffusion) +
          (neighbors * E.diffusion) / 8 +
          emissions[i]!) *
          (1 - E.decay),
      );
    }
  return next;
}
/** Field-centre rasterization visits only the source's affected rectangle. */
function raster(
  s: SimState,
  pos: Vec2,
  radius: number,
  visit: (i: number, x: number, z: number, d: number) => void,
) {
  const n = s.fields.size,
    cell = MAP_SIZE / n;
  const x0 = Math.max(0, Math.floor((pos.x - radius + MAP_SIZE / 2) / cell)),
    x1 = Math.min(n - 1, Math.floor((pos.x + radius + MAP_SIZE / 2) / cell));
  const z0 = Math.max(0, Math.floor((pos.z - radius + MAP_SIZE / 2) / cell)),
    z1 = Math.min(n - 1, Math.floor((pos.z + radius + MAP_SIZE / 2) / cell));
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5) * cell - MAP_SIZE / 2,
        pz = (z + 0.5) * cell - MAP_SIZE / 2,
        d = Math.hypot(px - pos.x, pz - pos.z);
      if (d <= radius) visit(z * n + x, px, pz, d);
    }
}
export function updatePollution(s: SimState) {
  const emissions = new Float32Array(s.fields.pollution.length);
  for (const b of s.buildings) {
    if (b.state !== 'active' || b.enabled === false || b.fire?.burning)
      continue;
    const amount =
      b.defId === 'I'
        ? b.jobs *
          (industryDefinition(b.industry)?.pollutionPerJob ??
            E.industrialPerJob)
        : b.defId === 'power_coal' || b.defId === 'power_oil'
          ? E.powerPollution
          : b.defId === 'garbage_landfill'
            ? E.landfillPollution
            : 0;
    if (amount) emissions[fieldIndex(center(b), s.fields.size)]! += amount;
  }
  s.fields.pollution = diffusePollution(
    s.fields.pollution,
    s.fields.size,
    emissions,
  );
}
export function updateNoise(
  s: SimState,
  flow: ReadonlyMap<number, { count: number }> = new Map(),
) {
  const values = new Float32Array(s.fields.noise.length),
    trees = new Uint8Array(values.length);
  const noise = (distance: number, strength: number) =>
    strength / (1 + (distance / E.noiseReferenceM) ** 2);
  for (const b of s.buildings) {
    if (b.state !== 'active' || b.enabled === false || b.fire?.burning)
      continue;
    const p = center(b);
    if (b.defId === 'tree') {
      raster(s, p, parkDefinition('tree')!.radiusM!, (i) => {
        trees[i] = 1;
      });
      continue;
    }
    const strength =
      b.defId === 'I'
        ? b.jobs * E.industrialNoisePerJob
        : b.defId === 'CL' || b.defId === 'CH'
          ? b.jobs * E.commercialNoisePerJob
          : b.defId === 'power_wind'
            ? E.windNoise
            : 0;
    if (strength)
      raster(s, p, E.noiseRadiusM, (i, _x, _z, d) => {
        values[i]! += noise(d, strength);
      });
  }
  const nodes = new Map(s.nodes.map((n) => [n.id, n]));
  for (const road of s.segments) {
    const count = flow.get(road.id)?.count ?? 0,
      a = nodes.get(road.start),
      b = nodes.get(road.end);
    if (!count || !a || !b) continue;
    const points = sampleRoad(road, a, b),
      strength = ROADS[road.type].noise * count * E.roadNoisePerVehicle;
    const contributed = new Map<number, number>();
    for (let k = 1; k < points.length; k++) {
      const p = points[k - 1]!,
        q = points[k]!,
        mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
      raster(
        s,
        mid,
        E.noiseRadiusM + Math.hypot(q.x - p.x, q.z - p.z) / 2,
        (i, x, z) => {
          const d = closestPointOnSegment({ x, z }, p, q).distance;
          if (d <= E.noiseRadiusM)
            contributed.set(
              i,
              Math.max(contributed.get(i) ?? 0, noise(d, strength)),
            );
        },
      );
    }
    for (const [i, v] of contributed) values[i]! += v;
  }
  for (let i = 0; i < values.length; i++)
    values[i] = clamp(values[i]! * (trees[i] ? 1 - E.treeNoiseReduction : 1));
  s.fields.noise = values;
}
export function riverX(s: SimState, z: number): number {
  const v = Math.max(
      0,
      Math.min(
        s.terrain.river.length - 1,
        ((z + MAP_SIZE / 2) / MAP_SIZE) * (s.terrain.river.length - 1),
      ),
    ),
    i = Math.floor(v),
    t = v - i;
  return (
    s.terrain.river[i]! * (1 - t) +
    s.terrain.river[Math.min(s.terrain.river.length - 1, i + 1)]! * t
  );
}
export function updateWaterPollution(s: SimState) {
  const n = s.fields.size,
    cell = MAP_SIZE / n,
    old = s.fields.waterPollution,
    next = new Float32Array(old.length),
    half = s.terrain.riverWidth / 2;
  for (let z = 0; z < n; z++) {
    const pz = (z + 0.5) * cell - MAP_SIZE / 2,
      rx = riverX(s, pz),
      up = z - E.waterFlowCells;
    const upstreamX = riverX(s, pz - E.waterFlowCells * cell);
    if (up < 0) continue;
    for (let x = 0; x < n; x++) {
      const px = (x + 0.5) * cell - MAP_SIZE / 2;
      if (Math.abs(px - rx) > half + cell / 2) continue;
      const sourceX = Math.round(x + (upstreamX - rx) / cell);
      if (sourceX >= 0 && sourceX < n)
        next[z * n + x] = old[up * n + sourceX]! * (1 - E.waterDecay);
    }
  }
  for (const b of s.buildings) {
    const d = waterDefinition(b.defId);
    if (
      b.state !== 'active' ||
      b.enabled === false ||
      b.fire?.burning ||
      !(b.flags & POWER.flag) ||
      !d ||
      d.water.output !== 'sewage' ||
      !b.sewageDischarge
    )
      continue;
    const p = intakePoint(b.pos, b.rotation),
      rx = riverX(s, p.z);
    if (Math.abs(p.x - rx) > E.riverSourceReachM) continue;
    const row = Math.floor(fieldIndex({ x: rx, z: p.z }, n) / n);
    const amount =
      (b.sewageDischarge / TIME.fiscalPeriodDays) *
      E.sewagePollutionPerM3Day *
      (1 - d.water.pollutionReduction);
    for (let x = 0; x < n; x++)
      if (Math.abs((x + 0.5) * cell - MAP_SIZE / 2 - rx) <= half + cell / 2)
        next[row * n + x] = clamp(next[row * n + x]! + amount);
  }
  s.fields.waterPollution = next;
}
export function smoothField(source: Float32Array, size: number): Float32Array {
  const result = new Float32Array(source.length);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (z > 0 && z < size - 1 && x > 0 && x < size - 1) {
        // Interior cells always have nine neighbors. Preserve the reference summation order.
        result[i] = clamp(
          (source[i - size - 1]! +
            source[i - size]! +
            source[i - size + 1]! +
            source[i - 1]! +
            source[i]! +
            source[i + 1]! +
            source[i + size - 1]! +
            source[i + size]! +
            source[i + size + 1]!) /
            9,
        );
        continue;
      }
      let sum = 0,
        count = 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          if (z + dz >= 0 && z + dz < size && x + dx >= 0 && x + dx < size) {
            sum += source[(z + dz) * size + x + dx]!;
            count++;
          }
      result[z * size + x] = clamp(sum / count);
    }
  return result;
}
export function updateLandValue(s: SimState): BuildingPatch[] {
  const n = s.fields.size,
    cell = MAP_SIZE / n,
    bonus = parkField(s),
    raw = new Float32Array(n * n),
    abandoned = new Uint8Array(n * n),
    transit = new Uint8Array(n * n);
  for (const b of s.buildings)
    if (b.state === 'abandoned' || b.state === 'burned')
      raster(s, center(b), E.abandonedRadiusM, (i) => {
        abandoned[i] = 1;
      });
  for (const b of s.buildings)
    if (
      b.defId === 'metro_station' &&
      b.state === 'active' &&
      b.enabled !== false &&
      !b.fire?.burning
    )
      raster(s, center(b), E.transitRadiusM, (i) => {
        transit[i] = 1;
      });
  for (let z = 0; z < n; z++) {
    const rx = riverX(s, (z + 0.5) * cell - MAP_SIZE / 2);
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      const coverage =
        s.fields.coverage.police[i]! +
        s.fields.coverage.fire[i]! +
        s.fields.coverage.health[i]! +
        s.fields.coverage.education[i]!;
      const waterside =
        Math.abs((x + 0.5) * cell - MAP_SIZE / 2 - rx) -
          s.terrain.riverWidth / 2 <
        E.watersideRangeM
          ? E.watersideBonus
          : 0;
      raw[i] = clamp(
        PARKS.baseLandValue +
          bonus[i]! +
          coverage * E.serviceBonus +
          waterside +
          (transit[i] ? E.transitBonus : 0) -
          s.fields.pollution[i]! * E.pollutionPenalty -
          s.fields.noise[i]! * E.noisePenalty -
          (abandoned[i] ? E.abandonedPenalty : 0),
      );
    }
  }
  s.fields.landValue = smoothField(raw, n);
  return environmentSummary(s, bonus);
}
export function environmentSummary(
  s: SimState,
  bonus = parkField(s),
): BuildingPatch[] {
  const patches: BuildingPatch[] = [];
  for (let i = 0; i < bonus.length; i++)
    s.fields.coverage.parks[i] = Math.min(1, bonus[i]! / PARKS.treeBonusCap);
  for (const b of s.buildings) {
    const i = fieldIndex(b.pos, s.fields.size),
      landValue = s.fields.landValue[i]!,
      parkBonus = bonus[i]!;
    const environment = {
      pollution: s.fields.pollution[i]!,
      noise: s.fields.noise[i]!,
      waterPollution:
        s.fields.waterPollution[
          fieldIndex(intakePoint(b.pos, b.rotation), s.fields.size)
        ]!,
    };
    if (
      b.landValue !== landValue ||
      b.parkBonus !== parkBonus ||
      b.environment?.pollution !== environment.pollution ||
      b.environment.noise !== environment.noise ||
      b.environment.waterPollution !== environment.waterPollution
    ) {
      b.landValue = landValue;
      b.parkBonus = parkBonus;
      b.environment = environment;
      patches.push({ id: b.id, landValue, parkBonus, environment });
    }
  }
  return patches;
}
/** Four separate fixed steps per fiscal day; the saved simulation clock prevents replay on load. */
export class FieldsSystem {
  private lastTick = -1;
  constructor(
    private readonly s: SimState,
    private readonly flow: () => ReadonlyMap<number, { count: number }> = () =>
      new Map(),
  ) {}
  step():
    | {
        fields: ('pollution' | 'noise' | 'waterPollution' | 'landValue')[];
        buildings: BuildingPatch[];
      }
    | undefined {
    if (this.lastTick === this.s.clock.ticks) return;
    this.lastTick = this.s.clock.ticks;
    const phase = this.s.clock.tickInDay;
    const which = (Object.keys(E.phases) as (keyof typeof E.phases)[]).find(
      (k) => E.phases[k] === phase,
    );
    if (!which) return;
    const before = this.s.fields[which];
    let buildings: BuildingPatch[];
    if (which === 'pollution') updatePollution(this.s);
    else if (which === 'noise') updateNoise(this.s, this.flow());
    else if (which === 'waterPollution') updateWaterPollution(this.s);
    if (which === 'landValue') buildings = updateLandValue(this.s);
    else buildings = environmentSummary(this.s);
    const after = this.s.fields[which];
    let changed = false;
    for (let i = 0; i < after.length; i++)
      if (before[i] !== after[i]) {
        changed = true;
        break;
      }
    return changed || buildings.length
      ? { fields: changed ? [which] : [], buildings }
      : undefined;
  }
}
