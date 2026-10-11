import { emptyDisasters } from '../world/disasters';
import { emptyDeathcare } from '../world/deathcare';
import { emptyGarbage } from '../world/garbage';
import { emptyFire } from '../world/fire';
import { emptyCargo } from '../world/cargo';
import { emptyTraffic } from '../world/traffic';
import { createCitizens } from '../world/citizens';
import { addStarterCity } from './starterCity';
import { updateDemand } from './systems/demand';
import { SERVICE_TYPES } from '../data/buildings';
import { MAP_TILES, WORLD } from '../data/config';
import { BUDGET_DEPARTMENTS, ECONOMY } from '../data/economy';
import { MILESTONES } from '../data/milestones';
import { HAPPINESS } from '../data/simulation';
import { SIM_RUNTIME } from '../data/simRuntime';
import { resolveMap } from '../world/mapSelection';
import { INITIAL_DEMAND, ZONES } from '../data/zones';
import { Terrain } from '../world/terrain';
import type { CitySettings, WorldSnapshot } from '../world/snapshot';
import type { Fields } from '../world/types';

export interface SimState extends Omit<WorldSnapshot, 'terrain'> {
  terrain: Terrain;
}

/** Build the authoritative empty city. The visible preview buildings are not gameplay entities. */
export function createState(settings: CitySettings): SimState {
  const preset = resolveMap(settings.mapId, settings.seed);
  if (
    !preset ||
    !Number.isSafeInteger(settings.seed) ||
    !['normal', 'easy', 'sandbox'].includes(settings.mode) ||
    typeof settings.cityName !== 'string' ||
    !settings.cityName.trim() ||
    settings.cityName.length > SIM_RUNTIME.maxCityNameLength
  )
    throw new RangeError('Invalid city settings');
  const money =
    ECONOMY.startingMoney[settings.mode === 'easy' ? 'easy' : 'normal'];
  const field = () => new Float32Array(WORLD.fieldCells ** 2);
  const state: SimState = {
    seed: settings.seed,
    settings: { ...settings, cityName: settings.cityName.trim() },
    clock: { day: 0, tickInDay: 0, ticks: 0, speed: SIM_RUNTIME.initialSpeed },
    money,
    loans: [],
    economy: {
      distressWeeks: 0,
      status: 'normal',
      settledWeek: 0,
      taxIncome: Object.fromEntries(
        Object.keys(ZONES).map((z) => [z, 0]),
      ) as SimState['taxRates'],
      upkeep: Object.fromEntries(
        BUDGET_DEPARTMENTS.map((d) => [d, 0]),
      ) as SimState['budgets'],
      debtPayment: 0,
    },
    taxRates: Object.fromEntries(
      Object.keys(ZONES).map((key) => [key, ECONOMY.taxRate.default]),
    ) as WorldSnapshot['taxRates'],
    budgets: Object.fromEntries(
      BUDGET_DEPARTMENTS.map((key) => [key, SIM_RUNTIME.defaultBudget]),
    ) as WorldSnapshot['budgets'],
    terrain: new Terrain(settings.seed, preset),
    tileLimit: WORLD.maxOwnedTiles.desktop,
    ownedTiles: [WORLD.startTile[1] * MAP_TILES + WORLD.startTile[0]],
    nodes: [],
    segments: [],
    zoneBlocks: [],
    buildings: [],
    networks: { power: [], water: [] },
    fields: {
      size: WORLD.fieldCells,
      pollution: field(),
      noise: field(),
      landValue: field(),
      waterPollution: field(),
      coverage: Object.fromEntries(
        SERVICE_TYPES.map((key) => [key, field()]),
      ) as Fields['coverage'],
    },
    citizens: createCitizens(),
    traffic: emptyTraffic(),
    deathcare: emptyDeathcare(),
    garbage: emptyGarbage(),
    cargo: emptyCargo(),
    fire: emptyFire(),
    disasters: emptyDisasters(),
    transitLines: [],
    districts: [],
    policies: [],
    unlocked: settings.mode === 'sandbox' ? MILESTONES.map((m) => m.id) : [0],
    stats: {
      day: 0,
      money,
      population: 0,
      demand: { ...INITIAL_DEMAND },
      income: 0,
      expenses: 0,
      power: { produced: 0, consumed: 0 },
      water: { produced: 0, consumed: 0 },
      sewage: { capacity: 0, produced: 0 },
      happiness: HAPPINESS.base,
      milestone: 0,
    },
    statsHistory: [],
    nextId: 1,
  };
  if (settings.starterRoads) addStarterCity(state);
  updateDemand(state);
  return state;
}
