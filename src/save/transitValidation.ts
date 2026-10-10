import { TRANSIT as C } from '../data/transit';
import { ZONE_PALETTE } from '../data/palette';
import { BUILDINGS, TRANSIT as CAP } from '../data/buildings';
import type { WorldSnapshot } from '../world/snapshot';
export function validateTransit(
  s: WorldSnapshot,
): Map<number, { destination: number; kind: number }> {
  const check = (ok: unknown): void => {
    if (!ok) throw new Error('Invalid transit save');
  };
  const integer = (x: number) => Number.isSafeInteger(x) && x >= 0;
  const point = (p: { x: number; z: number }) =>
    p && typeof p.x === 'number' && typeof p.z === 'number';
  const missions = new Map<number, { destination: number; kind: number }>();
  const citizens = new Set<number>();
  const add = (id: number, destination: number, kind: number) => {
    check(integer(id) && id < s.traffic.nextMissionId! && !missions.has(id));
    if (id) missions.set(id, { destination, kind });
  };
  const depotCapacity = BUILDINGS.find((b) => b.id === 'bus_depot')!.capacity
    .vehicles;
  const assigned = new Map<number, number>();
  for (const value of [s.economy.transitIncome, s.economy.transitUnsettled])
    check(value === undefined || (typeof value === 'number' && value >= 0));
  check(s.transitLines.length <= C.maxLines);
  for (const l of s.transitLines) {
    check(
      l &&
        integer(l.depot) &&
        integer(l.color) &&
        l.color < Object.keys(ZONE_PALETTE).length &&
        typeof l.blocked === 'boolean' &&
        typeof l.length === 'number' &&
        l.length > 0 &&
        integer(l.vehicles) &&
        l.vehicles <= depotCapacity,
    );
    check(
      Array.isArray(l.stops) &&
        l.stops.length >= 2 &&
        l.stops.length <= C.maxStops &&
        l.stops.every(point),
    );
    check(
      [l.week, l.passengers, l.revenue, l.lastPassengers, l.lastRevenue].every(
        integer,
      ),
    );
    check(
      Array.isArray(l.buses) &&
        l.buses.length <= l.vehicles &&
        Array.isArray(l.riders) &&
        l.riders.length <= C.maxPassengers,
    );
    assigned.set(l.depot, (assigned.get(l.depot) ?? 0) + l.vehicles);
    check(assigned.get(l.depot)! <= depotCapacity);
    const buses = new Set(l.buses.map((b) => b.id));
    const aboard = new Map<number, number>();
    for (const b of l.buses) {
      check(
        integer(b.target) && b.target < l.stops.length && point(b.position),
      );
      add(b.mission, l.id, 2);
    }
    for (const p of l.riders) {
      const j = p.journey,
        row = s.citizens.id.subarray(0, s.citizens.count).indexOf(j?.citizenId);
      check(row >= 0 && !citizens.has(j.citizenId));
      citizens.add(j.citizenId);
      check(
        integer(p.from) &&
          integer(p.to) &&
          p.from < l.stops.length &&
          p.to < l.stops.length &&
          p.from !== p.to &&
          ['access', 'waiting', 'riding', 'egress'].includes(p.stage) &&
          point(p.position) &&
          integer(p.since) &&
          p.since <= s.clock.ticks,
      );
      check(
        j.destinationId === s.citizens.destinationId[row] &&
          j.requestedTick === s.citizens.tripStartTick[row] &&
          s.citizens.tripStatus[row] === 2 &&
          j.originId === s.citizens.tripOriginId[row] &&
          j.purpose === s.citizens.tripPurpose[row] &&
          [0, 1].includes(j.mode),
      );
      check(
        p.stage === 'access' || p.stage === 'egress'
          ? p.mission > 0
          : p.mission === 0,
      );
      if (p.stage === 'riding') {
        check(buses.has(p.bus));
        aboard.set(p.bus, (aboard.get(p.bus) ?? 0) + 1);
      }
      add(p.mission, p.stage === 'egress' ? j.destinationId : l.id, 8);
    }
    check([...aboard.values()].every((n) => n <= CAP.busPassengers));
  }
  check(citizens.size <= C.maxPassengers);
  return missions;
}
