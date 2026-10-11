import { UNIQUE_BUILDINGS } from '../data/unique';
export const uniqueDefinition = (id: string) =>
  UNIQUE_BUILDINGS.find((d) => d.id === id);
import type { PowerWorld, PowerReason } from './power';
/** Occupancy is checked even in sandbox; only prerequisites are waived there. */
export function uniqueReason(w: PowerWorld, id: string): PowerReason | null {
  const d = uniqueDefinition(id);
  if (!d) return null;
  if (w.buildings.some((b) => 'defId' in b && b.defId === id))
    return 'err.uniqueExists';
  if (w.mode === 'sandbox') return null;
  if (!w.unlocked.includes(d.unlock)) return 'err.powerLocked';
  if (
    !w.buildings.some(
      (b) =>
        'defId' in b &&
        b.defId === d.requires &&
        'state' in b &&
        b.state === 'active' &&
        (!('enabled' in b) || b.enabled !== false),
    )
  )
    return 'err.uniqueRequires';
  return null;
}
