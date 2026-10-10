import { emptyTraffic } from '../world/traffic';
import { TRAFFIC_RUNTIME } from '../data/traffic';
import {
  CITIZEN_INT_FIELDS,
  CITIZEN_BYTE_FIELDS,
  createCitizens,
} from '../world/citizens';
import { WORLD } from '../data/config';
import { SERVICE_TYPES } from '../data/buildings';
import { BUDGET_DEPARTMENTS } from '../data/economy';
import { ROADS } from '../data/roads';
import { ZONES } from '../data/zones';
import { CITIZENS, PROBLEMS } from '../data/simulation';
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
        typeof n.height === 'number' &&
        ['none', 'lights', 'stop'].includes(n.control) &&
        (n.manualControl === undefined ||
          typeof n.manualControl === 'boolean') &&
        (n.banLeft === undefined || typeof n.banLeft === 'boolean'),
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
  // v1 M1 files used an empty reserved array; the Worker deterministically expands households.
  if (Array.isArray(s.citizens)) {
    requireValue(s.citizens.length === 0);
    s.citizens = createCitizens();
  }
  const c = s.citizens;
  requireValue(
    c &&
      c.version === 1 &&
      Number.isSafeInteger(c.count) &&
      c.count >= 0 &&
      c.count <= 1000000 &&
      Number.isSafeInteger(c.nextId) &&
      c.nextId > 0 &&
      Number.isSafeInteger(c.nextHouseholdId) &&
      c.nextHouseholdId > 0 &&
      Number.isSafeInteger(c.lastDay),
  );
  // M2-07 tables predate journey columns. Add only wholly absent journey schema.
  if (!Object.hasOwn(c, 'locationId')) {
    for (const k of [
      'locationId',
      'destinationId',
      'tripOriginId',
      'tripStartTick',
      'shiftEndTick',
      'lastShiftCycle',
      'activityUntilTick',
      'lastShoppingCycle',
      'lastLeisureCycle',
    ] as const)
      c[k] = new Int32Array(c.id.length);
    for (const k of [
      'tripStatus',
      'tripPurpose',
      'travelMode',
      'restAfterTrip',
    ] as const)
      c[k] = new Uint8Array(c.id.length);
  }
  for (const k of CITIZEN_INT_FIELDS)
    requireValue(
      c[k] instanceof Int32Array &&
        c[k].length >= c.count &&
        c[k].length === c.id.length,
    );
  for (const k of CITIZEN_BYTE_FIELDS)
    requireValue(c[k] instanceof Uint8Array && c[k].length === c.id.length);
  const homes = new Set(
    s.buildings
      .filter((b) => b.kind === 'zoned' && ['RL', 'RH'].includes(b.defId))
      .map((b) => b.id),
  );
  const citizenIds = new Set<number>(),
    families = new Map<number, { home: number; count: number }>();
  for (let i = 0; i < c.count; i++) {
    requireValue(
      c.id[i]! > 0 &&
        c.id[i]! < c.nextId &&
        !citizenIds.has(c.id[i]!) &&
        homes.has(c.homeId[i]!) &&
        (!c.workId[i] || buildings.has(c.workId[i]!)) &&
        (!c.schoolId[i] || buildings.has(c.schoolId[i]!)) &&
        c.householdId[i]! > 0 &&
        c.householdId[i]! < c.nextHouseholdId &&
        c.age[i]! <= 100 &&
        c.education[i]! <= 3 &&
        c.health[i]! <= 100 &&
        c.happiness[i]! <= 100 &&
        c.wealth[i]! <= 2 &&
        c.state[i]! <= 7 &&
        c.jobType[i]! <= 12 &&
        c.shiftId[i]! <= 2 &&
        c.requiredEducation[i]! <= c.education[i]! &&
        c.bornDay[i]! > -CITIZENS.daysPerAgeYear &&
        c.bornDay[i]! <= s.clock.day &&
        c.schoolDays[i]! >= 0 &&
        c.tripStatus[i]! <= 3 &&
        c.tripPurpose[i]! <= 5 &&
        c.travelMode[i]! <= 1 &&
        c.restAfterTrip[i]! <= 1 &&
        c.locationId[i]! >= 0 &&
        c.destinationId[i]! >= 0 &&
        c.tripOriginId[i]! >= 0 &&
        (c.tripStatus[i] === 0 ||
          (c.tripPurpose[i]! > 0 &&
            c.destinationId[i]! > 0 &&
            c.tripOriginId[i]! > 0)) &&
        c.restAfterTrip[i]! <= 1 &&
        c.tripStartTick[i]! >= 0 &&
        c.tripStartTick[i]! <= s.clock.ticks &&
        c.shiftEndTick[i]! >= 0 &&
        c.activityUntilTick[i]! >= 0 &&
        c.lastShiftCycle[i]! >= 0 &&
        c.lastShoppingCycle[i]! >= 0 &&
        c.lastLeisureCycle[i]! >= 0,
    );
    citizenIds.add(c.id[i]!);
    const family = families.get(c.householdId[i]!) ?? {
      home: c.homeId[i]!,
      count: 0,
    };
    requireValue(family.home === c.homeId[i] && ++family.count <= 5);
    families.set(c.householdId[i]!, family);
  }
  // No traffic collection existed before M2-10.
  if (!Object.hasOwn(s, 'traffic')) s.traffic = emptyTraffic();
  const traffic = s.traffic;
  requireValue(
    traffic?.version === 1 &&
      Number.isSafeInteger(traffic.nextId) &&
      traffic.nextId > 0 &&
      traffic.nextId <= TRAFFIC_RUNTIME.maxVehicleId &&
      typeof traffic.seconds === 'number' &&
      traffic.seconds >= 0 &&
      Number.isSafeInteger(traffic.arrived) &&
      traffic.arrived >= 0 &&
      Number.isSafeInteger(traffic.removedStuck) &&
      traffic.removedStuck >= 0 &&
      Array.isArray(traffic.routes) &&
      Array.isArray(traffic.vehicles) &&
      traffic.vehicles.length <= TRAFFIC_RUNTIME.capacity &&
      traffic.routes.length <= traffic.vehicles.length &&
      Array.isArray(traffic.stranded),
  );
  for (const route of traffic.routes) {
    requireValue(
      ['drive', 'walk'].includes(route.mode) &&
        Array.isArray(route.legs) &&
        route.legs.length > 0 &&
        route.legs.length <= 20000,
    );
    for (const leg of route.legs) {
      requireValue(
        ['lane', 'junction', 'laneChange', 'walk', 'access'].includes(
          leg.kind,
        ) &&
          typeof leg.id === 'string' &&
          typeof leg.length === 'number' &&
          leg.length >= 0 &&
          typeof leg.speedMps === 'number' &&
          leg.speedMps > 0 &&
          Number.isSafeInteger(leg.segment) &&
          (leg.startDistance === undefined || leg.startDistance >= 0),
      );
      if (leg.kind === 'access' || leg.kind === 'laneChange')
        requireValue(
          Array.isArray(leg.points) &&
            leg.points.length >= 2 &&
            leg.points.length <= 10000 &&
            leg.points.every(
              (p, i) =>
                point(p) &&
                typeof p.y === 'number' &&
                typeof p.distance === 'number' &&
                p.distance >= 0 &&
                (!i || p.distance >= leg.points![i - 1]!.distance),
            ),
        );
      else
        requireValue(
          typeof leg.lane === 'string' ||
            (typeof leg.fromLane === 'string' &&
              typeof leg.toLane === 'string'),
        );
    }
  }
  const vehicleIds = new Set<number>(),
    travelling = new Set<number>();
  const journeyValid = (j: (typeof traffic.vehicles)[number]['journey']) =>
    j &&
    Number.isSafeInteger(j.citizenId) &&
    citizenIds.has(j.citizenId) &&
    Number.isSafeInteger(j.originId) &&
    j.originId > 0 &&
    Number.isSafeInteger(j.destinationId) &&
    j.destinationId > 0 &&
    [1, 2, 3, 4, 5].includes(j.purpose) &&
    [0, 1].includes(j.mode) &&
    Number.isSafeInteger(j.requestedTick) &&
    j.requestedTick >= 0 &&
    j.requestedTick <= s.clock.ticks;
  for (const v of traffic.vehicles) {
    requireValue(
      Number.isSafeInteger(v.id) &&
        v.id > 0 &&
        v.id <= TRAFFIC_RUNTIME.maxVehicleId &&
        !vehicleIds.has(v.id) &&
        journeyValid(v.journey) &&
        !travelling.has(v.journey.citizenId) &&
        Number.isSafeInteger(v.kind) &&
        v.kind >= 0 &&
        v.kind <= 8 &&
        Number.isSafeInteger(v.route) &&
        v.route >= 0 &&
        v.route < traffic.routes.length &&
        Number.isSafeInteger(v.leg) &&
        v.leg >= 0 &&
        v.leg < traffic.routes[v.route]!.legs.length &&
        [v.distance, v.speed, v.stopped, v.stopWait].every(
          (n) => typeof n === 'number',
        ) &&
        v.distance >= 0 &&
        v.distance <= traffic.routes[v.route]!.legs[v.leg]!.length + 1e-4 &&
        v.speed >= 0 &&
        v.stopped >= 0 &&
        v.stopWait >= 0 &&
        Number.isSafeInteger(v.reservedNode) &&
        v.reservedNode >= 0 &&
        [v.x, v.y, v.z, v.yaw].every((x) => typeof x === 'number'),
    );
    vehicleIds.add(v.id);
    travelling.add(v.journey.citizenId);
  }
  for (const v of traffic.stranded) {
    requireValue(
      journeyValid(v.journey) &&
        !travelling.has(v.journey.citizenId) &&
        [v.x, v.y, v.z, v.laneDistance].every((x) => typeof x === 'number') &&
        v.laneDistance >= 0 &&
        typeof v.lane === 'string',
    );
    travelling.add(v.journey.citizenId);
  }
  return s;
}
