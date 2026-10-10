import { validateTransit } from './transitValidation';
import { HEALTH } from '../data/health';
import { emptyFire } from '../world/fire';
import { FIRE } from '../data/fire';
import { emptyCargo } from '../world/cargo';
import { CARGO } from '../data/cargo';
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
  requireValue(
    s.environmentVersion === undefined || s.environmentVersion === 1,
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
        s.fields[key].length === WORLD.fieldCells ** 2 &&
        s.fields[key].every((v) => Number.isFinite(v) && v >= 0 && v <= 100),
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
    ...s.transitLines,
    ...s.transitLines.flatMap((l) => l.buses ?? []),
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
        (b.enabled === undefined || typeof b.enabled === 'boolean') &&
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
    requireValue(
      (b.crime === undefined ||
        (typeof b.crime === 'number' &&
          Number.isFinite(b.crime) &&
          b.crime >= 0 &&
          b.crime <= 100)) &&
        (b.crimeUpdatedDay === undefined ||
          (Number.isSafeInteger(b.crimeUpdatedDay) &&
            b.crimeUpdatedDay >= 0 &&
            b.crimeUpdatedDay <= s.clock.day)),
    );
    if (b.happiness !== undefined)
      requireValue(
        Number.isFinite(b.happiness) && b.happiness >= 0 && b.happiness <= 100,
      );
    if (b.development) {
      requireValue(
        Number.isSafeInteger(b.development.lastDay) &&
          b.development.lastDay >= -1 &&
          b.development.lastDay <= s.clock.day,
      );
      for (const value of [
        b.development.lastCheckDay,
        b.development.lowValueSinceDay,
        b.development.changedDay,
      ])
        if (value !== undefined)
          requireValue(
            Number.isSafeInteger(value) && value >= 0 && value <= s.clock.day,
          );
    }
    if (b.upgrade)
      requireValue(
        Number.isSafeInteger(b.upgrade.target) &&
          b.upgrade.target >= 1 &&
          b.upgrade.target <= 5 &&
          [
            b.upgrade.landRequired,
            b.upgrade.education,
            b.upgrade.educationRequired,
            b.upgrade.progress,
          ].every((v) => Number.isFinite(v) && v >= 0) &&
          b.upgrade.progress <= 1 &&
          typeof b.upgrade.utilities === 'boolean',
      );
    for (const value of [b.landValue, b.parkBonus])
      if (value !== undefined)
        requireValue(Number.isFinite(value) && value >= 0);
    if (b.landValue !== undefined) requireValue(b.landValue <= 100);
    if (b.sewageDischarge !== undefined)
      requireValue(
        Number.isFinite(b.sewageDischarge) && b.sewageDischarge >= 0,
      );
    if (b.environment)
      for (const key of ['pollution', 'noise', 'waterPollution'] as const)
        requireValue(
          Number.isFinite(b.environment[key]) &&
            b.environment[key] >= 0 &&
            b.environment[key] <= 100,
        );
    if (b.education)
      requireValue(
        Number.isSafeInteger(b.education.enrolled) &&
          b.education.enrolled >= 0 &&
          Number.isSafeInteger(b.education.eligible) &&
          b.education.eligible >= b.education.enrolled &&
          (b.education.capacity === undefined ||
            (Number.isSafeInteger(b.education.capacity) &&
              b.education.capacity >= b.education.enrolled)),
      );
    if (b.health)
      requireValue(
        Number.isFinite(b.health.average) &&
          b.health.average >= 0 &&
          b.health.average <= 100 &&
          Number.isSafeInteger(b.health.sick) &&
          b.health.sick >= 0 &&
          Number.isSafeInteger(b.health.residents) &&
          b.health.residents >= b.health.sick,
      );
    if (b.drinkingWaterPollution !== undefined)
      requireValue(
        Number.isFinite(b.drinkingWaterPollution) &&
          b.drinkingWaterPollution >= 0 &&
          b.drinkingWaterPollution <= 100,
      );
    if (b.fire)
      requireValue(
        typeof b.fire.burning === 'boolean' &&
          Number.isFinite(b.fire.damage) &&
          b.fire.damage >= 0 &&
          b.fire.damage <= 1 &&
          Number.isSafeInteger(b.fire.startedDay) &&
          b.fire.startedDay >= 0 &&
          b.fire.startedDay <= s.clock.day &&
          (!b.fire.burning || (b.state === 'active' && b.fire.damage < 1)),
      );
    if (b.coverage)
      for (const [key, value] of Object.entries(b.coverage))
        requireValue(
          (SERVICE_TYPES as readonly string[]).includes(key) &&
            typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= 0 &&
            value <= 1,
        );
    if (b.serviceStatus)
      requireValue(
        ['radius', 'capacity', 'demand', 'efficiency'].every((key) => {
          const value = b.serviceStatus![key as 'radius'];
          return (
            typeof value === 'number' && Number.isFinite(value) && value >= 0
          );
        }) &&
          b.serviceStatus.efficiency <= 1 &&
          typeof b.serviceStatus.connected === 'boolean',
      );
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
  if (!Object.hasOwn(c, 'lastHealthDay')) c.lastHealthDay = -1;
  requireValue(
    Number.isSafeInteger(c.lastHealthDay) &&
      c.lastHealthDay >= -1 &&
      c.lastHealthDay <= s.clock.day,
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
  if (!Object.hasOwn(c, 'healthFraction'))
    c.healthFraction = new Uint8Array(c.id.length);
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
        c.healthFraction[i]! < HEALTH.precision &&
        (c.health[i]! < 100 || c.healthFraction[i] === 0) &&
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
  if (!Object.hasOwn(s, 'cargo')) s.cargo = emptyCargo();
  requireValue(
    s.cargo?.version === 1 &&
      Number.isSafeInteger(s.cargo.lastDay) &&
      s.cargo.lastDay >= -1 &&
      s.cargo.lastDay <= s.clock.day &&
      [
        s.cargo.delivered,
        s.cargo.imported,
        s.cargo.exported,
        s.cargo.lost,
      ].every((n) => typeof n === 'number' && n >= 0) &&
      Array.isArray(s.cargo.shipments) &&
      s.cargo.shipments.length <= CARGO.maxShipments,
  );
  const shipmentIds = new Map<number, (typeof s.cargo.shipments)[number]>();
  const buildingIds = new Set(s.buildings.map((b) => b.id));
  for (const b of s.buildings)
    if (b.cargo)
      requireValue(
        typeof b.cargo.stock === 'number' &&
          typeof b.cargo.capacity === 'number' &&
          b.cargo.stock >= 0 &&
          b.cargo.capacity > 0 &&
          b.cargo.stock <= b.cargo.capacity &&
          typeof b.cargo.shortage === 'boolean' &&
          typeof b.cargo.exportBlocked === 'boolean',
      );
  for (const job of s.cargo.shipments) {
    requireValue(
      Number.isSafeInteger(job.id) &&
        job.id > 0 &&
        !shipmentIds.has(job.id) &&
        Number.isSafeInteger(job.from) &&
        Number.isSafeInteger(job.to) &&
        (job.from === 0 || buildingIds.has(job.from)) &&
        (job.to === 0 || buildingIds.has(job.to)) &&
        typeof job.units === 'number' &&
        job.units > 0 &&
        job.units <= CARGO.truckCapacity &&
        ((job.kind === 'local' && job.from > 0 && job.to > 0) ||
          (job.kind === 'import' && job.from === 0 && job.to > 0) ||
          (job.kind === 'export' && job.from > 0 && job.to === 0)) &&
        Number.isSafeInteger(job.requestedTick) &&
        job.requestedTick >= 0 &&
        job.requestedTick <= s.clock.ticks &&
        Number.isSafeInteger(job.retryTick) &&
        job.retryTick >= 0,
    );
    shipmentIds.set(job.id, job);
  }
  if (!Object.hasOwn(s, 'fire')) s.fire = emptyFire();
  requireValue(
    s.fire?.version === 1 &&
      Number.isSafeInteger(s.fire.lastDay) &&
      s.fire.lastDay >= -1 &&
      s.fire.lastDay <= s.clock.day &&
      Array.isArray(s.fire.missions) &&
      s.fire.missions.length <= FIRE.maxMissions,
  );
  const fireIds = new Map<number, (typeof s.fire.missions)[number]>(),
    fireTargets = new Set<number>();
  for (const m of s.fire.missions) {
    const from = s.buildings.find((b) => b.id === m.from),
      to = s.buildings.find((b) => b.id === m.to);
    requireValue(
      Number.isSafeInteger(m.id) &&
        m.id > 0 &&
        !shipmentIds.has(m.id) &&
        !fireIds.has(m.id) &&
        !fireTargets.has(m.to) &&
        from?.state === 'active' &&
        ['fire_station', 'fire_hq'].includes(from.defId) &&
        from.enabled !== false &&
        !from.fire?.burning &&
        to?.state === 'active' &&
        to.fire?.burning === true &&
        Number.isSafeInteger(m.requestedTick) &&
        m.requestedTick >= 0 &&
        m.requestedTick <= s.clock.ticks &&
        Number.isSafeInteger(m.retryTick) &&
        m.retryTick >= 0,
    );
    fireIds.set(m.id, m);
    fireTargets.add(m.to);
  }
  // No traffic collection existed before M2-10.
  if (!Object.hasOwn(s, 'traffic')) s.traffic = emptyTraffic();
  const traffic = s.traffic;
  if (traffic && !Object.hasOwn(traffic, 'nextMissionId'))
    traffic.nextMissionId = 1;
  requireValue(
    traffic?.version === 1 &&
      Number.isSafeInteger(traffic.nextMissionId) &&
      traffic.nextMissionId >
        Math.max(0, ...shipmentIds.keys(), ...fireIds.keys()) &&
      traffic.nextMissionId <= TRAFFIC_RUNTIME.maxVehicleId &&
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
  const transitMissions = validateTransit(s);
  const vehicleIds = new Set<number>(),
    travelling = new Set<number>();
  const journeyValid = (j: (typeof traffic.vehicles)[number]['journey']) =>
    j &&
    Number.isSafeInteger(j.citizenId) &&
    (citizenIds.has(j.citizenId) ||
      (j.citizenId < 0 &&
        j.purpose === 8 &&
        transitMissions.get(-j.citizenId)?.destination === j.destinationId &&
        j.mode === (transitMissions.get(-j.citizenId)?.kind === 8 ? 0 : 1) &&
        j.originId === 0) ||
      (j.citizenId < 0 &&
        j.mode === 1 &&
        ((j.purpose === 6 &&
          shipmentIds.get(-j.citizenId)?.from === j.originId &&
          shipmentIds.get(-j.citizenId)?.to === j.destinationId) ||
          (j.purpose === 7 &&
            fireIds.get(-j.citizenId)?.from === j.originId &&
            fireIds.get(-j.citizenId)?.to === j.destinationId)))) &&
    Number.isSafeInteger(j.originId) &&
    (j.originId > 0 || (j.citizenId < 0 && j.originId === 0)) &&
    Number.isSafeInteger(j.destinationId) &&
    (j.destinationId > 0 || (j.citizenId < 0 && j.destinationId === 0)) &&
    (j.citizenId < 0
      ? [6, 7, 8].includes(j.purpose)
      : [1, 2, 3, 4, 5].includes(j.purpose)) &&
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
        (v.journey.purpose !== 8 ||
          transitMissions.get(-v.journey.citizenId)?.kind === v.kind) &&
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
  for (const id of transitMissions.keys())
    requireValue(
      travelling.has(-id) && !shipmentIds.has(id) && !fireIds.has(id),
    );
  return s;
}
