import { BUILDINGS, type BuildingDefinition } from '../data/buildings';
import { DEATHCARE as G } from '../data/deathcare';
import type { Building } from './types';
export interface Mortuary {
  stock: number;
  processedToday: number;
  lastDay: number;
  full: boolean;
  vehicles: number;
}
export interface DeathcareMission {
  id: number;
  from: number;
  to: number;
  phase: 'collect' | 'return';
  pickup: { x: number; z: number };
  setback: number;
  units: number;
  requestedTick: number;
  retryTick: number;
}
export interface DeathcareState {
  version: 1;
  missions: DeathcareMission[];
  collected: number;
  processed: number;
  lost: number;
}
export const emptyDeathcare = (): DeathcareState => ({
  version: 1,
  missions: [],
  collected: 0,
  processed: 0,
  lost: 0,
});
export const deathcareDefinition = (
  id: string,
): BuildingDefinition | undefined =>
  (G.ids as readonly string[]).includes(id)
    ? BUILDINGS.find((d) => d.id === id)
    : undefined;
export const deathcareCapacity = (b: Building): number => {
  const def = deathcareDefinition(b.defId)?.capacity;
  return def?.graves ?? (def?.processingPerDay ?? 0) * G.bufferDays;
};
export const deathcareOperational = (b: Building): boolean =>
  b.state === 'active' && b.enabled !== false && !b.fire?.burning;
