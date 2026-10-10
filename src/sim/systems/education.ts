import { CITIZEN_RULES as R } from '../../data/citizens';
import { serviceDefinition } from '../../world/services';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
/** Derived attendance summaries; personal school IDs remain the authoritative allocation. */
export function updateEducationSummary(s: SimState): BuildingPatch[] {
  const totals = new Map<
    number,
    { enrolled: number; eligible: number; capacity?: number }
  >();
  for (const b of s.buildings) {
    const d = serviceDefinition(b.defId);
    if (d?.capacity?.students)
      totals.set(b.id, {
        enrolled: 0,
        eligible: 0,
        capacity:
          b.state === 'active' && b.enabled !== false && !b.fire?.burning
            ? Math.floor(d.capacity.students * s.budgets.education)
            : 0,
      });
    else if (b.housing || b.education)
      totals.set(b.id, { enrolled: 0, eligible: 0 });
  }
  const c = s.citizens;
  for (let i = 0; i < c.count; i++) {
    const e = c.education[i]!,
      age = c.age[i]!,
      home = totals.get(c.homeId[i]!);
    if (e >= 3 || age < R.schoolMinAge[e]! || age > R.schoolMaxAge[e]!)
      continue;
    if (home) home.eligible++;
    const school = totals.get(c.schoolId[i]!);
    if (school?.capacity !== undefined) {
      school.enrolled++;
      school.eligible++;
      if (home) home.enrolled++;
    }
  }
  const patches: BuildingPatch[] = [];
  for (const b of s.buildings) {
    const next = totals.get(b.id);
    if (next && JSON.stringify(b.education) !== JSON.stringify(next)) {
      b.education = next;
      patches.push({ id: b.id, education: { ...next } });
    }
  }
  return patches;
}
