import { SpatialHash } from '../../core/spatial';
import { BUILDINGS, type BuildingDefinition } from '../../data/buildings';
import { CITIZEN_RULES } from '../../data/citizens';
import { CITIZENS, POPULATION_PROFILE } from '../../data/simulation';
import {
  createCitizens,
  JobType,
  reserveCitizens,
  removeCitizen,
  type CitizenTable,
} from '../../world/citizens';
import { emptyEducation, jobPlaces, residential } from '../../world/population';
import type { Building, EducationCounts } from '../../world/types';
import type { SimState } from '../state';

const definitions = new Map<string, BuildingDefinition>(
  BUILDINGS.map((d) => [d.id, d]),
);
const systems = new WeakMap<SimState, CitizenSystem>();
export function citizenSystem(s: SimState): CitizenSystem {
  let system = systems.get(s);
  if (!system) {
    system = new CitizenSystem(s);
    systems.set(s, system);
  }
  return system;
}
/** Stateless deterministic draw: loading / structural edits consume no random sequence. */
function draw(seed: number, id: number, day: number, salt: number): number {
  let n = seed ^ Math.imul(id, 0x85ebca6b) ^ Math.imul(day, 0x9e3779b1) ^ salt;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function weighted(value: number, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i]!;
    if (value < sum / 100) return i;
  }
  return weights.length - 1;
}
export function citizenJobType(b: Building): number {
  if (b.kind === 'zoned')
    return b.defId === 'I'
      ? JobType.industrial
      : b.defId === 'O'
        ? JobType.office
        : JobType.commercial;
  const service = definitions.get(b.defId)?.service;
  return service ? JobType[service] : JobType.utility;
}
export function citizenJobPlaces(b: Building): EducationCounts {
  if (b.state !== 'active') return emptyEducation();
  if (b.kind === 'zoned') return jobPlaces(b);
  const def = definitions.get(b.defId);
  return def
    ? [...CITIZEN_RULES.publicJobs[def.service ?? 'utility']]
    : emptyEducation();
}
const working = (age: number) =>
  age >= CITIZEN_RULES.workingAge[0] && age <= CITIZEN_RULES.workingAge[1];
interface Family {
  id: number;
  home: number;
  members: number[];
}
/** Derived indexes are rebuilt on load, while every personal decision stays in the save. */
export class CitizenSystem {
  private readonly structure: (number | string | undefined)[] = [];
  private readonly byId = new Map<number, Building>();
  private dirty = true;
  private readonly indices = new Map<number, number>();
  private readonly families = new Map<number, Family>();
  private readonly homes = new Map<number, Family[]>();
  constructor(private readonly s: SimState) {
    if (Array.isArray(s.citizens)) s.citizens = createCitizens(); // M1's reserved empty collection.
    const c = s.citizens;
    for (let i = 0; i < c.count; i++) {
      this.indices.set(c.id[i]!, i);
      let f = this.families.get(c.householdId[i]!);
      if (!f) {
        f = { id: c.householdId[i]!, home: c.homeId[i]!, members: [] };
        this.addFamily(f);
      }
      f.members.push(c.id[i]!);
    }
  }
  indexOf(id: number): number | undefined {
    return this.indices.get(id);
  }
  private addFamily(f: Family): void {
    this.families.set(f.id, f);
    const list = this.homes.get(f.home) ?? [];
    list.push(f);
    this.homes.set(f.home, list);
  }
  private add(f: Family, newborn = false): void {
    const c = this.s.citizens;
    reserveCitizens(c, c.count + 1);
    const i = c.count++,
      id = c.nextId++;
    c.id[i] = id;
    c.homeId[i] = f.home;
    c.householdId[i] = f.id;
    c.bornDay[i] =
      this.s.clock.day - (newborn ? 0 : id % CITIZENS.daysPerAgeYear);
    c.age[i] = newborn
      ? 0
      : CITIZEN_RULES.incomingAges[
          weighted(
            draw(this.s.seed, id, 0, 1),
            CITIZEN_RULES.incomingAgeWeights,
          )
        ]!;
    c.education[i] =
      newborn || c.age[i]! < CITIZEN_RULES.schoolMinAge[0]
        ? 0
        : Math.min(
            c.age[i]! <= 12 ? 0 : c.age[i]! <= 18 ? 1 : 3,
            weighted(
              draw(this.s.seed, id, 0, 2),
              CITIZEN_RULES.incomingEducationWeights,
            ),
          );
    c.health[i] = CITIZEN_RULES.initialHealth;
    c.happiness[i] = CITIZEN_RULES.initialHappiness;
    c.wealth[i] = Math.min(2, Math.floor(c.education[i]! / 2));
    this.indices.set(id, i);
    f.members.push(id);
  }
  private remove(id: number): void {
    const c = this.s.citizens,
      i = this.indices.get(id)!;
    removeCitizen(c, i);
    this.indices.delete(id);
    if (i < c.count) this.indices.set(c.id[i]!, i);
  }
  private structureChanged(remember = false): boolean {
    let cursor = 0,
      changed = false;
    const compare = (value: number | string | undefined) => {
      if (this.structure[cursor] !== value) changed = true;
      if (remember) this.structure[cursor] = value;
      cursor++;
    };
    for (const b of this.s.buildings) {
      compare(b.id);
      compare(b.state);
      compare(b.defId);
      compare(b.level);
      compare(b.lotW);
      compare(b.lotD);
      compare(b.pos.x);
      compare(b.pos.z);
      compare(b.roadDisconnectedDay);
      for (let i = 0; i < 5; i++) compare(b.housing?.sizes[i]);
    }
    changed ||= cursor !== this.structure.length;
    if (remember) this.structure.length = cursor;
    return changed;
  }
  private buildings(): Map<number, Building> {
    if (
      this.byId.size !== this.s.buildings.length ||
      this.s.buildings.some((b) => this.byId.get(b.id) !== b)
    ) {
      this.byId.clear();
      for (const b of this.s.buildings) this.byId.set(b.id, b);
    }
    return this.byId;
  }
  /** Reconcile whole-household immigration/displacement, preserving everyone else. */
  reconcile(): void {
    const s = this.s,
      c = s.citizens,
      byId = this.buildings();
    if (!this.dirty && !this.structureChanged()) return;
    this.structureChanged(true);
    this.dirty = false;
    for (const [home, families] of this.homes) {
      const b = byId.get(home),
        target = b?.housing?.sizes ?? [0, 0, 0, 0, 0];
      const used = [0, 0, 0, 0, 0];
      const keep: Family[] = [];
      for (const f of families) {
        const size = f.members.length - 1;
        if (used[size]! < target[size]!) {
          used[size]!++;
          keep.push(f);
        } else {
          for (const id of f.members) this.remove(id);
          this.families.delete(f.id);
        }
      }
      this.homes.set(home, keep);
    }
    for (const b of [...s.buildings].sort((a, b) => a.id - b.id)) {
      if (!b.housing || !residential(b)) continue;
      const actual = [0, 0, 0, 0, 0];
      for (const f of this.homes.get(b.id) ?? [])
        actual[f.members.length - 1]!++;
      for (let size = 0; size < actual.length; size++)
        for (let n = actual[size]!; n < b.housing.sizes[size]!; n++) {
          const f = { id: c.nextHouseholdId++, home: b.id, members: [] };
          this.addFamily(f);
          for (let person = 0; person <= size; person++) this.add(f);
        }
    }
    this.assign(byId);
    this.summarize(byId);
  }
  /** One fiscal day, idempotent. Lifetime clocks are distinct from the M2-08 travel clock. */
  daily(): { births: number; deaths: number } {
    const s = this.s,
      c = s.citizens,
      day = s.clock.day;
    if (c.lastDay >= day) return { births: 0, deaths: 0 };
    c.lastDay = day;
    c.births = c.deaths = 0;
    const byId = this.buildings();
    const structuralChange = this.structureChanged();
    for (let i = c.count - 1; i >= 0; i--) {
      const school = byId.get(c.schoolId[i]!),
        def = school && definitions.get(school.defId);
      if (
        school?.state === 'active' &&
        school.roadDisconnectedDay === undefined &&
        def?.capacity?.educationLevel === c.education[i]! + 1
      ) {
        c.schoolDays[i]!++;
        if (
          c.schoolDays[i]! >=
          CITIZEN_RULES.schoolDaysToGraduate[c.education[i]!]!
        ) {
          this.adjustSummary(i, -1, byId);
          this.dirty = true;
          c.education[i]!++;
          c.schoolId[i] = 0;
          c.schoolDays[i] = 0;
          this.adjustSummary(i, 1, byId);
        }
      }
      if (
        day <= c.bornDay[i]! ||
        (day - c.bornDay[i]!) % CITIZENS.daysPerAgeYear
      )
        continue;
      const groupChanges = [12, 18, 64].includes(c.age[i]!);
      if (groupChanges) this.adjustSummary(i, -1, byId);
      c.age[i] = Math.min(CITIZENS.ageRange[1], c.age[i]! + 1);
      if (c.age[i] === CITIZEN_RULES.workingAge[0]) this.dirty = true;
      if (c.age[i]! > CITIZEN_RULES.workingAge[1]) {
        if (c.workId[i]) this.dirty = true;
        c.workId[i] = 0;
        c.jobType[i] = 0;
        c.shiftId[i] = 0;
      }
      if (groupChanges) this.adjustSummary(i, 1, byId);
      if (c.age[i]! < CITIZENS.ageGroups.elder[0]) continue;
      if (
        c.age[i]! < CITIZENS.ageRange[1] &&
        draw(s.seed, c.id[i]!, day, 3) >=
          (c.age[i]! - CITIZENS.elderDeathBaseAge) *
            CITIZENS.elderDeathAnnualRatePerYear
      )
        continue;
      this.adjustSummary(i, -1, byId);
      const f = this.families.get(c.householdId[i]!)!,
        b = byId.get(f.home);
      if (b?.housing) b.housing.sizes[f.members.length - 1]!--;
      const id = c.id[i]!;
      f.members.splice(f.members.indexOf(id), 1);
      if (b?.housing && f.members.length)
        b.housing.sizes[f.members.length - 1]!++;
      if (!f.members.length) {
        this.families.delete(f.id);
        const list = this.homes.get(f.home)!;
        list.splice(list.indexOf(f), 1);
      }
      this.remove(id);
      c.deaths++;
    }
    if (day % CITIZENS.birthIntervalDays === 0) {
      for (const f of this.families.values()) {
        if (
          f.members.length >= 5 ||
          !f.members.some((id) => working(c.age[this.indices.get(id)!]!))
        )
          continue;
        if (draw(s.seed, f.id, day, 4) >= CITIZENS.birthChancePerAdultHousehold)
          continue;
        const b = byId.get(f.home);
        if (!b?.housing || b.state !== 'active') continue;
        b.housing.sizes[f.members.length - 1]!--;
        this.add(f, true);
        this.adjustSummary(c.count - 1, 1, byId);
        b.housing.sizes[f.members.length - 1]!++;
        c.births++;
      }
    }
    for (const b of byId.values())
      if (b.housing) {
        b.housing.occupied = b.housing.sizes.reduce((a, n) => a + n, 0);
        b.housing.averageEducation = b.residents
          ? b.housing.education.reduce((a, n, e) => a + n * e, 0) / b.residents
          : 0;
      }
    if (!structuralChange) this.structureChanged(true);
    return { births: c.births, deaths: c.deaths };
  }
  private adjustSummary(
    i: number,
    delta: 1 | -1,
    byId: Map<number, Building>,
  ): void {
    const c = this.s.citizens,
      b = byId.get(c.homeId[i]!),
      h = b?.housing;
    if (!b || !h) return;
    const age = c.age[i]!,
      e = c.education[i]!;
    b.residents += delta;
    h.education[e]! += delta;
    h.ages[age <= 12 ? 0 : age <= 18 ? 1 : age <= 64 ? 2 : 3]! += delta;
    if (working(age) && !c.schoolId[i]) h.availableWorkers[e]! += delta;
    const work = byId.get(c.workId[i]!);
    if (!work) return;
    work.workers += delta;
    work.workerEducation![e]! += delta;
    h.employed += delta;
    const entry = h.assignments.find(
      (a) =>
        a.workplaceId === work.id &&
        a.education === e &&
        a.requiredEducation === c.requiredEducation[i],
    );
    if (entry) {
      entry.workers += delta;
      if (!entry.workers) h.assignments.splice(h.assignments.indexOf(entry), 1);
    }
  }
  private assign(byId: Map<number, Building>): void {
    const c = this.s.citizens;
    const jobs = new Map<number, EducationCounts>();
    for (const b of byId.values()) {
      if (residential(b)) continue;
      b.jobEducation = citizenJobPlaces(b);
      b.jobs = b.jobEducation.reduce((a, n) => a + n, 0);
      if (b.roadDisconnectedDay === undefined && b.jobs)
        jobs.set(b.id, [...b.jobEducation]);
    }
    this.schools(byId);
    // Reserve existing jobs before hiring. New nearer workplaces never arbitrarily steal employees.
    for (let i = 0; i < c.count; i++) {
      const slots = jobs.get(c.workId[i]!),
        required = c.requiredEducation[i]!;
      if (
        working(c.age[i]!) &&
        !c.schoolId[i] &&
        byId.get(c.homeId[i]!)?.roadDisconnectedDay === undefined &&
        slots &&
        slots[required]! > 0 &&
        c.education[i]! >= required
      )
        slots[required]!--;
      else {
        c.workId[i] = 0;
        c.jobType[i] = JobType.none;
        c.shiftId[i] = 0;
        c.requiredEducation[i] = 0;
      }
    }
    const waiting = new Map<number, number[][]>();
    for (let i = 0; i < c.count; i++) {
      if (
        c.workId[i] ||
        c.schoolId[i] ||
        !working(c.age[i]!) ||
        byId.get(c.homeId[i]!)?.roadDisconnectedDay !== undefined
      )
        continue;
      let list = waiting.get(c.homeId[i]!);
      if (!list) {
        list = [[], [], [], []];
        waiting.set(c.homeId[i]!, list);
      }
      list[c.education[i]!]!.push(i);
    }
    for (let education = 0; education < 4; education++) {
      const index = new SpatialHash<number>(POPULATION_PROFILE.jobSearchCellM);
      for (const [id, slots] of jobs)
        if (slots.some((n, e) => e <= education && n > 0))
          index.set(id, byId.get(id)!.pos);
      for (const [home, groups] of [...waiting].sort((a, b) => a[0] - b[0])) {
        const available = groups[education]!,
          pos = byId.get(home)!.pos;
        while (available.length && index.size) {
          let radius: number = POPULATION_PROFILE.jobSearchCellM,
            candidates = index.queryRadius(pos, radius);
          while (!candidates.length) {
            radius *= 2;
            candidates = index.queryRadius(pos, radius);
          }
          candidates.sort((a, b) => {
            const p = byId.get(a)!.pos,
              q = byId.get(b)!.pos;
            return (
              (p.x - pos.x) ** 2 +
                (p.z - pos.z) ** 2 -
                ((q.x - pos.x) ** 2 + (q.z - pos.z) ** 2) || a - b
            );
          });
          const id = candidates[0]!,
            b = byId.get(id)!,
            slots = jobs.get(id)!;
          for (let e = education; e >= 0 && available.length; e--) {
            while (slots[e]! > 0 && available.length) {
              const i = available.shift()!;
              slots[e]!--;
              c.workId[i] = id;
              c.requiredEducation[i] = e;
              c.jobType[i] = citizenJobType(b);
              c.shiftId[i] =
                c.jobType[i] === JobType.industrial
                  ? c.id[i]! % CITIZEN_RULES.industrialShiftCount
                  : 0;
            }
          }
          if (!slots.some((n, e) => e <= education && n > 0)) index.delete(id);
        }
      }
    }
  }
  private schools(byId: Map<number, Building>): void {
    const c = this.s.citizens,
      slots = new Map<number, number>();
    const schools = [...byId.values()]
      .filter(
        (b) =>
          b.state === 'active' &&
          b.roadDisconnectedDay === undefined &&
          definitions.get(b.defId)?.capacity?.students,
      )
      .sort((a, b) => a.id - b.id);
    for (const b of schools)
      slots.set(b.id, definitions.get(b.defId)!.capacity!.students!);
    for (let i = 0; i < c.count; i++) {
      const e = c.education[i]!,
        age = c.age[i]!,
        old = c.schoolId[i]!;
      const eligible =
        e < 3 &&
        age >= CITIZEN_RULES.schoolMinAge[e]! &&
        age <= CITIZEN_RULES.schoolMaxAge[e]! &&
        byId.get(c.homeId[i]!)?.roadDisconnectedDay === undefined;
      if (
        eligible &&
        (slots.get(old) ?? 0) > 0 &&
        definitions.get(byId.get(old)!.defId)?.capacity?.educationLevel ===
          e + 1
      ) {
        slots.set(old, slots.get(old)! - 1);
        continue;
      }
      c.schoolId[i] = 0;
      if (old) c.schoolDays[i] = 0;
      if (!eligible || c.workId[i]) continue;
      const home = byId.get(c.homeId[i]!)!;
      let chosen: Building | undefined,
        best = Infinity;
      for (const b of schools) {
        const def = definitions.get(b.defId)!,
          distance = Math.hypot(b.pos.x - home.pos.x, b.pos.z - home.pos.z);
        if (
          slots.get(b.id)! > 0 &&
          def.capacity?.educationLevel === e + 1 &&
          distance <= (def.radiusM ?? 0) &&
          distance < best
        ) {
          chosen = b;
          best = distance;
        }
      }
      if (chosen) {
        c.schoolId[i] = chosen.id;
        slots.set(chosen.id, slots.get(chosen.id)! - 1);
      }
    }
  }
  private summarize(byId: Map<number, Building>): void {
    const c = this.s.citizens;
    const assignments = new Map<
      number,
      Map<
        string,
        {
          workplaceId: number;
          education: number;
          requiredEducation: number;
          workers: number;
        }
      >
    >();
    for (const b of byId.values()) {
      b.workers = 0;
      b.workerEducation = emptyEducation();
      if (b.housing) {
        const h = b.housing;
        h.education = emptyEducation();
        h.ages = emptyEducation();
        h.availableWorkers = emptyEducation();
        h.employed = 0;
        h.assignments = [];
        b.residents = 0;
      }
    }
    for (let i = 0; i < c.count; i++) {
      const b = byId.get(c.homeId[i]!)!,
        h = b.housing!,
        e = c.education[i]!,
        age = c.age[i]!;
      b.residents++;
      h.education[e]!++;
      h.ages[age <= 12 ? 0 : age <= 18 ? 1 : age <= 64 ? 2 : 3]!++;
      if (working(age) && !c.schoolId[i]) h.availableWorkers[e]!++;
      const work = byId.get(c.workId[i]!);
      if (!work) continue;
      work.workers++;
      work.workerEducation![e]!++;
      h.employed++;
      let map = assignments.get(b.id);
      if (!map) {
        map = new Map();
        assignments.set(b.id, map);
      }
      const key = `${work.id}:${e}:${c.requiredEducation[i]}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          workplaceId: work.id,
          education: e,
          requiredEducation: c.requiredEducation[i]!,
          workers: 0,
        };
        map.set(key, entry);
        h.assignments.push(entry);
      }
      entry.workers++;
    }
    for (const b of byId.values())
      if (b.housing) {
        const h = b.housing;
        h.occupied = h.sizes.reduce((a, n) => a + n, 0);
        h.averageEducation = b.residents
          ? h.education.reduce((a, n, e) => a + n * e, 0) / b.residents
          : 0;
        h.assignments.sort(
          (a, b) =>
            a.education - b.education ||
            a.workplaceId - b.workplaceId ||
            a.requiredEducation - b.requiredEducation,
        );
      }
  }
}
/** Includes allocated spare capacity, not only occupied rows. */
export function citizenBytes(c: CitizenTable): number {
  return Object.values(c).reduce<number>(
    (sum, v) => sum + (ArrayBuffer.isView(v) ? v.byteLength : 0),
    0,
  );
}
