import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, NETWORKS } from '../../src/data/buildings';
import {
  CELL_SIZE,
  MAP_CELLS,
  MAP_SIZE,
  MAP_TILES,
  QUALITY,
  TIME,
  WORLD,
} from '../../src/data/config';
import { ECONOMY, LOANS } from '../../src/data/economy';
import { FEATURES, MILESTONES } from '../../src/data/milestones';
import { ZONE_PALETTE } from '../../src/data/palette';
import { INDUSTRY_SPECIALIZATIONS, POLICIES } from '../../src/data/policies';
import { ROADS } from '../../src/data/roads';
import { PROBLEMS } from '../../src/data/simulation';
import {
  JOB_EDUCATION_PERCENT,
  UPGRADE_REQUIREMENTS,
  ZONE_CODES,
  ZONES,
} from '../../src/data/zones';

const gdd = readFileSync(new URL('../../docs/GDD.md', import.meta.url), 'utf8');
const rows = gdd
  .split('\n')
  .filter((line) => line.trimStart().startsWith('|'))
  .map((line) =>
    line
      .trim()
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replaceAll('`', '')),
  );
function row(id: string): string[] {
  const result = rows.find((cells) => cells[0] === id);
  if (!result) throw new Error(`Missing GDD row: ${id}`);
  return result;
}
function numeric(cell: string | undefined): number {
  if (cell === undefined) throw new Error('Missing numeric GDD cell');
  const match = cell.replaceAll(',', '').match(/\d+(?:\.\d+)?/);
  if (!match) throw new Error(`Not numeric: ${cell}`);
  return Number(match[0]);
}
function unlock(cell: string | undefined): number {
  return cell === '開局' ? 0 : numeric(cell);
}
const unlockables = [
  ...Object.entries(ROADS).map(([id, value]) => ({ id, ...value })),
  ...Object.entries(ZONES).map(([id, value]) => ({ id, ...value })),
  ...BUILDINGS,
  ...NETWORKS,
  ...LOANS,
  ...FEATURES,
  ...POLICIES,
  ...INDUSTRY_SPECIALIZATIONS,
];

describe('data registry integrity', () => {
  it('has globally unique content IDs and unique milestone IDs', () => {
    const ids = unlockables.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(MILESTONES.map((entry) => entry.id)).size).toBe(
      MILESTONES.length,
    );
    expect(new Set(Object.values(ZONE_CODES)).size).toBe(
      Object.keys(ZONE_CODES).length,
    );
  });
  it.each(unlockables)('$id references an existing milestone', (entry) => {
    expect(MILESTONES.some((milestone) => milestone.id === entry.unlock)).toBe(
      true,
    );
  });
  it('covers every explicitly identified GDD road, zone, building and network', () => {
    const catalogSections =
      gdd.slice(gdd.indexOf('## 3. 道路'), gdd.indexOf('## 6. 需求')) +
      gdd.slice(gdd.indexOf('## 9. 水電'), gdd.indexOf('## 11. 環境'));
    const sourceIds = [...catalogSections.matchAll(/^\| `([^`]+)` \|/gm)].map(
      (match) => match[1],
    );
    const dataIds = new Set(unlockables.map((entry) => entry.id));
    for (const id of sourceIds) expect(dataIds.has(id ?? ''), id).toBe(true);
    expect(Object.keys(ROADS)).toHaveLength(8);
    expect(Object.keys(ZONES)).toHaveLength(6);
    expect(BUILDINGS).toHaveLength(30);
    expect(NETWORKS).toHaveLength(3);
    expect(POLICIES).toHaveLength(11);
    expect(INDUSTRY_SPECIALIZATIONS).toHaveLength(4);
  });
});

describe('GDD table fidelity', () => {
  it.each(Object.entries(ROADS))(
    '%s preserves dimensions, lanes, costs, noise and unlock',
    (id, road) => {
      const cells = row(id);
      expect([
        road.widthM,
        road.speedKph,
        road.costPer8M,
        road.upkeepPer8MWeek,
        road.noise,
        road.unlock,
      ]).toEqual([
        numeric(cells[2]),
        numeric(cells[4]),
        numeric(cells[5]),
        numeric(cells[6]),
        numeric(cells[8]),
        unlock(cells[9]),
      ]);
      const lanes = cells[3]?.match(/\d+/g)?.map(Number);
      expect([road.lanesForward, road.lanesBackward]).toEqual([
        lanes?.[0],
        lanes?.[1] ?? 0,
      ]);
      expect(road.zoning).toBe(
        cells[7]?.includes('✘')
          ? 'none'
          : cells[7]?.includes('低密度')
            ? 'low-density'
            : 'all',
      );
    },
  );
  it.each(
    BUILDINGS.filter(
      (entry) => !['bus_depot', 'metro_station'].includes(entry.id),
    ),
  )('$id preserves construction and maintenance costs', (building) => {
    const cells = row(building.id);
    expect(building.cost).toBe(numeric(cells[2]));
    expect(building.upkeepPerWeek).toBe(numeric(cells[3]));
    if (building.kind !== 'park')
      expect(building.unlock).toBe(unlock(cells.at(-1)));
    if ('radiusM' in building && building.kind === 'service')
      expect(building.radiusM).toBe(numeric(cells[4]));
  });
  it.each(NETWORKS.filter((entry) => entry.id !== 'metro_track'))(
    '$id keeps per-length costs separate from buildings',
    (network) => {
      const cells = row(network.id);
      expect(network.costPer8M).toBe(numeric(cells[2]));
      expect(network.upkeepPer8MWeek).toBe(numeric(cells[3]));
      expect(network.unlock).toBe(unlock(cells.at(-1)));
    },
  );
  it.each(Object.entries(ZONES))(
    '%s preserves levels, capacity, color and unlock',
    (id, zone) => {
      const cells = row(id);
      expect(zone.maxLevel).toBe(numeric(cells[3]));
      expect(zone.unlock).toBe(unlock(cells[4]));
      expect(ZONE_PALETTE[id as keyof typeof ZONES].normal).toBe(cells[2]);
      const capacityRow = rows.find(
        (cells) => cells[0] === id && cells.at(-1)?.includes('/ 格'),
      );
      expect(capacityRow).toBeDefined();
      expect(zone.capacityPerCell).toEqual(
        capacityRow?.slice(1, 1 + zone.maxLevel).map(numeric),
      );
    },
  );
  it.each(MILESTONES)(
    'MS$id preserves population, reward and monotonic progression',
    (milestone) => {
      const cells = row(String(milestone.id));
      expect(milestone.population).toBe(numeric(cells[2]));
      expect(milestone.reward).toBe(cells[3] === '—' ? 0 : numeric(cells[3]));
      const previous = MILESTONES[milestone.id - 1];
      if (previous) {
        expect(milestone.population).toBeGreaterThan(previous.population);
        expect(milestone.maxOwnedTiles).toBeGreaterThanOrEqual(
          previous.maxOwnedTiles,
        );
      }
    },
  );
  it('preserves loan amounts, interest, duration and availability', () => {
    for (const [index, name] of [
      '小額貸款',
      '一般貸款',
      '大額貸款',
    ].entries()) {
      const cells = row(name);
      expect(LOANS[index]?.amount).toBe(numeric(cells[1]));
      expect(LOANS[index]?.annualInterest).toBe(numeric(cells[2]) / 100);
      expect(LOANS[index]?.termWeeks).toBe(numeric(cells[3]));
    }
    expect(LOANS.map((loan) => loan.unlock)).toEqual([0, 0, 4]);
    expect(ECONOMY.startingMoney).toEqual({ normal: 70000, easy: 200000 });
  });
  it('preserves upgrade requirements and distinguishes unsupported levels from zero', () => {
    for (const target of UPGRADE_REQUIREMENTS) {
      const cells = row(`Lv${target.level}`);
      expect(target.landValue).toBe(numeric(cells[1]));
      expect(target.residentEducation).toBe(numeric(cells[2]));
      expect(target.workerEducation).toBe(
        cells[3] === '—' ? null : numeric(cells[3]),
      );
    }
  });
  it('preserves all abandonment and fire timers', () => {
    const source = rows.filter(
      (cells) => cells[2]?.includes('天') && cells.length === 3,
    );
    expect(source).toHaveLength(Object.keys(PROBLEMS).length);
    expect(Object.values(PROBLEMS).map((problem) => problem.days)).toEqual(
      source.map((cells) => numeric(cells[2])),
    );
    expect(PROBLEMS.fire.result).toBe('burned');
  });
});

it('education distributions cover each job level and total 100%', () => {
  for (const [id, distributions] of Object.entries(JOB_EDUCATION_PERCENT)) {
    expect(distributions).toHaveLength(
      ZONES[id as keyof typeof ZONES].maxLevel,
    );
    for (const distribution of distributions) {
      expect(distribution).toHaveLength(4);
      expect(distribution.reduce((sum: number, value) => sum + value, 0)).toBe(
        100,
      );
    }
  }
});
it('world dimensions, samples, device limits and speeds are consistent', () => {
  expect(MAP_CELLS).toBe(600);
  expect(MAP_SIZE).toBe(4800);
  expect(MAP_SIZE / WORLD.heightmapSpacingM + 1).toBe(WORLD.heightmapVertices);
  expect(WORLD.fieldCells * WORLD.fieldSpacingM).toBe(MAP_CELLS * CELL_SIZE);
  expect(WORLD.startTile).toEqual([
    Math.floor(MAP_TILES / 2),
    Math.floor(MAP_TILES / 2),
  ]);
  expect(WORLD.maxOwnedTiles).toEqual({ desktop: 9, ipad: 9, iphone: 4 });
  for (const [speed, seconds] of Object.entries(TIME.secondsPerDay))
    expect(Number(speed) * seconds).toBeCloseTo(2.4);
  expect(Object.values(QUALITY).map((quality) => quality.maxVehicles)).toEqual([
    300, 1000, 3000,
  ]);
});
it('does not invent unspecified hydro output, footprints or track upkeep', () => {
  expect(
    BUILDINGS.find((building) => building.id === 'power_hydro')?.power.maxMW,
  ).toBeNull();
  expect(
    BUILDINGS.find((building) => building.id === 'clinic')?.footprintCells,
  ).toBeNull();
  expect(
    NETWORKS.find((network) => network.id === 'metro_track')?.upkeepPer8MWeek,
  ).toBeNull();
});

it('utility generation, water, garbage and service capacities retain GDD units', () => {
  for (const building of BUILDINGS) {
    if (building.id === 'bus_depot' || building.id === 'metro_station')
      continue;
    const cells = row(building.id);
    if ('power' in building && building.id.startsWith('power_')) {
      const output = cells[4]?.split('（')[0]?.match(/\d+/g)?.map(Number);
      expect(building.power.maxMW).toBe(output?.at(-1) ?? null);
    }
    if ('water' in building)
      expect(building.water.capacityM3PerWeek).toBe(numeric(cells[4]));
    if ('garbage' in building) {
      expect(
        building.garbage.storageUnits ?? building.garbage.processingUnitsPerDay,
      ).toBe(numeric(cells[4]));
      expect(building.garbage.trucks).toBe(numeric(cells[5]));
    }
    if ('capacity' in building) {
      const counts = cells[5]?.replaceAll(',', '').match(/\d+/g)?.map(Number);
      const capacity = building.capacity;
      if ('patients' in capacity)
        expect([capacity.patients, capacity.vehicles]).toEqual(counts);
      else if ('graves' in capacity)
        expect([capacity.graves, capacity.vehicles]).toEqual(counts);
      else if ('students' in capacity) {
        expect(capacity.students).toBe(counts?.[0]);
        expect(capacity.educationLevel).toBe(numeric(cells[6]));
      } else if ('vehicles' in capacity)
        expect(capacity.vehicles).toBe(counts?.[0]);
      else if ('processingPerDay' in capacity)
        expect(capacity.processingPerDay).toBe(counts?.[0]);
    }
    if (building.kind === 'park' && building.id !== 'tree') {
      expect(building.footprintCells).toEqual(
        cells[4]?.split('（')[0]?.match(/\d+/g)?.map(Number),
      );
      expect(building.landValueBonus).toBe(numeric(cells[5]));
      expect(building.radiusM).toBe(numeric(cells[6]));
    }
  }
});
it('unlocks parks according to the detailed milestone table', () => {
  expect(
    BUILDINGS.filter((building) => building.kind === 'park').map(
      ({ id, unlock }) => [id, unlock],
    ),
  ).toEqual([
    ['park_small', 0],
    ['park_playground', 1],
    ['park_plaza', 2],
    ['park_large', 5],
    ['tree', 0],
  ]);
  expect(MILESTONES.map((milestone) => milestone.maxOwnedTiles)).toEqual([
    1, 1, 1, 2, 2, 3, 4, 5, 6, 7, 9,
  ]);
});
