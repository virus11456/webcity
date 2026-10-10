import { WORLD } from '../data/config';
import { SERVICE_TYPES } from '../data/buildings';
import { BUDGET_DEPARTMENTS } from '../data/economy';
import { ROADS } from '../data/roads';
import { ZONES } from '../data/zones';
import { PROBLEMS } from '../data/simulation';
import { SAVE } from '../data/persistence';
import type { WorldSnapshot } from '../world/snapshot';

function requireValue(ok: unknown): asserts ok {
  if (!ok) throw new Error('Invalid save data');
}
function finiteTree(value: unknown, depth = 0): void {
  requireValue(depth < 64);
  if (typeof value === 'number') requireValue(Number.isFinite(value));
  else if (value instanceof Float32Array)
    requireValue(value.every(Number.isFinite));
  else if (ArrayBuffer.isView(value)) return;
  else if (value && typeof value === 'object')
    for (const child of Object.values(value)) finiteTree(child, depth + 1);
}
/** Reject unsupported versions and malformed topology before replacing the live city. */
export function migrateSave(value: unknown, version: number): WorldSnapshot {
  requireValue(version === SAVE.version && value && typeof value === 'object');
  const s = value as WorldSnapshot;
  finiteTree(s);
  requireValue(
    s.settings &&
      Number.isSafeInteger(s.settings.seed) &&
      typeof s.settings.cityName === 'string' &&
      ['normal', 'easy', 'sandbox'].includes(s.settings.mode),
  );
  requireValue(
    s.seed === s.settings.seed &&
      s.clock &&
      Number.isSafeInteger(s.clock.ticks) &&
      s.clock.ticks >= 0 &&
      [0, 1, 2, 4].includes(s.clock.speed),
  );
  requireValue(
    Number.isSafeInteger(s.clock.day) &&
      s.clock.day >= 0 &&
      Number.isSafeInteger(s.clock.tickInDay) &&
      s.clock.tickInDay >= 0,
  );
  requireValue(
    typeof s.money === 'number' &&
      Number.isSafeInteger(s.nextId) &&
      s.nextId > 0,
  );
  requireValue(
    s.terrain?.heights instanceof Float32Array &&
      s.terrain.heights.length === WORLD.heightmapVertices ** 2,
  );
  requireValue(
    s.terrain.river instanceof Float32Array &&
      s.terrain.river.length === WORLD.heightmapVertices &&
      typeof s.terrain.riverWidth === 'number',
  );
  for (const key of ['fertile', 'forest', 'ore', 'oil'] as const)
    requireValue(
      s.terrain.resources?.[key] instanceof Uint8Array &&
        s.terrain.resources[key].length === WORLD.fieldCells ** 2,
    );
  requireValue(s.fields?.size === WORLD.fieldCells);
  for (const key of [
    'pollution',
    'noise',
    'landValue',
    'waterPollution',
  ] as const)
    requireValue(
      s.fields[key] instanceof Float32Array &&
        s.fields[key].length === WORLD.fieldCells ** 2,
    );
  for (const key of SERVICE_TYPES)
    requireValue(
      s.fields.coverage?.[key] instanceof Float32Array &&
        s.fields.coverage[key].length === WORLD.fieldCells ** 2,
    );
  requireValue(
    s.economy && ['normal', 'warning', 'gameOver'].includes(s.economy.status),
  );
  for (const key of Object.keys(ZONES) as (keyof typeof ZONES)[])
    requireValue(
      typeof s.taxRates?.[key] === 'number' &&
        typeof s.economy.taxIncome?.[key] === 'number',
    );
  for (const key of BUDGET_DEPARTMENTS)
    requireValue(
      typeof s.budgets?.[key] === 'number' &&
        typeof s.economy.upkeep?.[key] === 'number',
    );
  for (const list of [
    s.nodes,
    s.segments,
    s.zoneBlocks,
    s.buildings,
    s.ownedTiles,
    s.unlocked,
    s.loans,
    s.policies,
    s.statsHistory,
    s.citizens,
    s.transitLines,
    s.districts,
    s.networks?.power,
    s.networks?.water,
  ])
    requireValue(Array.isArray(list));
  requireValue(
    s.stats &&
      typeof s.stats.population === 'number' &&
      s.stats.demand &&
      s.stats.power &&
      s.stats.water &&
      s.stats.sewage,
  );
  const ids = new Set<number>();
  for (const item of [
    ...s.nodes,
    ...s.segments,
    ...s.zoneBlocks,
    ...s.buildings,
    ...s.networks.power,
    ...s.networks.water,
  ]) {
    requireValue(
      item &&
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        item.id < s.nextId &&
        !ids.has(item.id),
    );
    ids.add(item.id);
  }
  const nodes = new Set(s.nodes.map((n) => n.id)),
    roads = new Set(s.segments.map((n) => n.id)),
    buildings = new Set(s.buildings.map((b) => b.id));
  const point = (p: unknown) =>
    !!p &&
    typeof p === 'object' &&
    'x' in p &&
    typeof p.x === 'number' &&
    'z' in p &&
    typeof p.z === 'number';
  for (const n of s.nodes)
    requireValue(
      point(n.pos) &&
        Array.isArray(n.segments) &&
        n.segments.every((id) => roads.has(id)) &&
        typeof n.height === 'number',
    );
  for (const r of s.segments)
    requireValue(
      r.type in ROADS &&
        (r.zoningReversed === undefined ||
          typeof r.zoningReversed === 'boolean') &&
        nodes.has(r.start) &&
        nodes.has(r.end) &&
        point(r.c1) &&
        point(r.c2) &&
        r.length > 0 &&
        Array.isArray(r.zoneBlockIds),
    );
  for (const b of s.zoneBlocks)
    requireValue(
      roads.has(b.segment) &&
        Number.isSafeInteger(b.width) &&
        b.width > 0 &&
        point(b.origin) &&
        point(b.dir) &&
        b.cells instanceof Uint8Array &&
        b.cells.length === b.width * 4 &&
        b.buildingAt instanceof Int32Array &&
        b.buildingAt.length === b.cells.length &&
        b.buildingAt.every((id) => id === -1 || buildings.has(id)),
    );
  for (const b of s.buildings) {
    requireValue(
      (b.frontageSetbackM === undefined ||
        (b.frontageSetbackM >= 0 &&
          b.frontageSetbackM <=
            Math.max(...Object.values(ROADS).map((r) => r.widthM)) / 2)) &&
        point(b.pos) &&
        typeof b.defId === 'string' &&
        ['construction', 'active', 'abandoned', 'burned'].includes(b.state) &&
        b.lotW > 0 &&
        b.lotD > 0 &&
        typeof b.rotation === 'number' &&
        typeof b.flags === 'number',
    );
    for (const key of Object.keys(PROBLEMS) as (keyof typeof PROBLEMS)[])
      requireValue(typeof b.problemTimers?.[key] === 'number');
    if (b.housing)
      requireValue(
        Array.isArray(b.housing.sizes) &&
          b.housing.sizes.length === 5 &&
          Array.isArray(b.housing.education) &&
          b.housing.education.length === 4 &&
          Array.isArray(b.housing.assignments),
      );
  }
  for (const n of [...s.networks.power, ...s.networks.water])
    requireValue(
      Array.isArray(n.points) && n.points.length > 1 && n.points.every(point),
    );
  return s;
}
