/** Dense, serializable SoA. IDs survive compaction; 0 is an absent building. */
export const CITIZEN_INT_FIELDS = [
  'id',
  'homeId',
  'workId',
  'schoolId',
  'householdId',
  'bornDay',
  'schoolDays',
] as const;
export const CITIZEN_BYTE_FIELDS = [
  'age',
  'education',
  'health',
  'happiness',
  'wealth',
  'state',
  'jobType',
  'shiftId',
  'requiredEducation',
] as const;
export type CitizenTable = {
  version: 1;
  count: number;
  nextId: number;
  nextHouseholdId: number;
  lastDay: number;
  births: number;
  deaths: number;
} & Record<(typeof CITIZEN_INT_FIELDS)[number], Int32Array> &
  Record<(typeof CITIZEN_BYTE_FIELDS)[number], Uint8Array>;
export const CitizenState = {
  home: 0,
  sleeping: 1,
  commuting: 2,
  working: 3,
  school: 4,
  shopping: 5,
  leisure: 6,
  sick: 7,
} as const;
export const JobType = {
  none: 0,
  commercial: 1,
  industrial: 2,
  office: 3,
  police: 4,
  fire: 5,
  health: 6,
  education: 7,
  utility: 8,
  parks: 9,
  deathcare: 10,
  garbage: 11,
  transit: 12,
} as const;
export function createCitizens(capacity = 0): CitizenTable {
  const arrays = Object.fromEntries([
    ...CITIZEN_INT_FIELDS.map((k) => [k, new Int32Array(capacity)]),
    ...CITIZEN_BYTE_FIELDS.map((k) => [k, new Uint8Array(capacity)]),
  ]) as Pick<
    CitizenTable,
    (typeof CITIZEN_INT_FIELDS)[number] | (typeof CITIZEN_BYTE_FIELDS)[number]
  >;
  return {
    version: 1,
    count: 0,
    nextId: 1,
    nextHouseholdId: 1,
    lastDay: -1,
    births: 0,
    deaths: 0,
    ...arrays,
  };
}
export function reserveCitizens(c: CitizenTable, count: number): void {
  if (count <= c.id.length) return;
  const capacity = Math.max(256, count, c.id.length * 2);
  for (const k of CITIZEN_INT_FIELDS) {
    const a = new Int32Array(capacity);
    a.set(c[k]);
    c[k] = a;
  }
  for (const k of CITIZEN_BYTE_FIELDS) {
    const a = new Uint8Array(capacity);
    a.set(c[k]);
    c[k] = a;
  }
}
export function removeCitizen(c: CitizenTable, index: number): void {
  const last = --c.count;
  for (const k of [...CITIZEN_INT_FIELDS, ...CITIZEN_BYTE_FIELDS]) {
    c[k][index] = c[k][last]!;
    c[k][last] = 0;
  }
}
