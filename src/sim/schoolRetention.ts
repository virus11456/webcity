import type { CitizenTable } from '../world/citizens';

/** Reach must depend only on home, school and education during this allocation. */
export function reserveSchoolPlaces(
  c: CitizenTable,
  eligible: readonly number[],
  slots: Map<number, number>,
  distance: (index: number, school: number) => number,
): void {
  // IDs usually keep household members together. Reuse only the last home/school/level
  // reach check, without an allocation-sized cache; seats are still reserved per pupil.
  let lastHome = -1,
    lastSchool = -1,
    lastEducation = -1,
    lastReachable = false;
  for (const i of eligible) {
    const old = c.schoolId[i]!;
    let reachable = false;
    if ((slots.get(old) ?? 0) > 0) {
      const home = c.homeId[i]!,
        education = c.education[i]!;
      if (
        home !== lastHome ||
        old !== lastSchool ||
        education !== lastEducation
      ) {
        lastHome = home;
        lastSchool = old;
        lastEducation = education;
        lastReachable = Number.isFinite(distance(i, old));
      }
      reachable = lastReachable;
    }
    if (reachable) slots.set(old, slots.get(old)! - 1);
    else c.schoolId[i] = 0;
  }
}
