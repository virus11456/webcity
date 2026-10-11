import { BUILDINGS, type BuildingDefinition } from '../data/buildings';
import { GARBAGE as G } from '../data/garbage';
import type { Building } from './types';
export interface WasteFacility {
  stock: number;
  processedToday: number;
  lastDay: number;
  full: boolean;
  vehicles: number;
}
export interface GarbageMission {
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
export interface GarbageState {
  version: 1;
  missions: GarbageMission[];
  collected: number;
  processed: number;
  lost: number;
}
export const emptyGarbage = (): GarbageState => ({
  version: 1,
  missions: [],
  collected: 0,
  processed: 0,
  lost: 0,
});
export const garbageDefinition = (
  id: string,
): BuildingDefinition | undefined =>
  (G.ids as readonly string[]).includes(id)
    ? BUILDINGS.find((d) => d.id === id)
    : undefined;
export const garbageCapacity = (b: Building): number => {
  const def = garbageDefinition(b.defId)?.garbage;
  return def?.storageUnits ?? (def?.processingUnitsPerDay ?? 0) * G.bufferDays;
};
export function incineratorOutput(b: Building): number {
  const d = garbageDefinition(b.defId);
  return garbageOperational(b) && d?.power && d.garbage?.processingUnitsPerDay
    ? (d.power.maxMW ?? 0) *
        Math.min(
          1,
          (b.wasteFacility?.processedToday ?? 0) /
            d.garbage.processingUnitsPerDay,
        )
    : 0;
}
export const garbageOperational = (b: Building): boolean =>
  b.state === 'active' && b.enabled !== false && !b.fire?.burning;
