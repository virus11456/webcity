import { createCitizens } from '../../src/world/citizens';
import { RoadGraph } from '../../src/world/roadGraph';
import { ServiceNetwork } from '../../src/world/services';

/** Synthetic existing pupils, including unreachable homes; not a natural city. */
export function schoolRetentionFixture(interleaved = false, count = 100000) {
  const c = createCitizens(count);
  c.count = count;
  const graph = new RoadGraph();
  for (const z of [0, 128])
    graph.addRoad({
      start: { x: -1200, z },
      end: { x: 1200, z },
      startHeight: 60,
      endHeight: 60,
      type: 'road_small',
      builtDay: 0,
    });
  const roads = graph.snapshot();
  const network = new ServiceNetwork(roads.nodes, roads.segments);
  const homes = new Map(
    Array.from({ length: 1000 }, (_, home) => [
      home + 1,
      network.access({ x: home * 2 - 1000, z: home % 5 ? 9 : 137 })!,
    ]),
  );
  const schools = new Map(
    Array.from({ length: 96 }, (_, school) => [
      school + 2000,
      {
        level: school % 3,
        reach: network.reach(
          network.access({ x: school * 20 - 960, z: 9 })!,
          600,
        ),
      },
    ]),
  );
  for (let i = 0; i < count; i++) {
    const home = interleaved ? i % 1000 : Math.floor(i / 100) % 1000;
    c.id[i] = i + 1;
    c.homeId[i] = home + 1;
    c.education[i] = home % 3;
    c.schoolId[i] = (home % 96) + 2000;
  }
  const distance = (i: number, schoolId: number) => {
    const school = schools.get(schoolId),
      home = homes.get(c.homeId[i]!);
    if (!school || !home || school.level !== c.education[i]) return Infinity;
    const distance = network.distance(school.reach, home);
    return distance <= school.reach.radius ? distance : Infinity;
  };
  return {
    c,
    distance,
    eligible: Array.from({ length: count }, (_, i) => i),
    slots: () => new Map([...schools.keys()].map((id) => [id, 750])),
  };
}
