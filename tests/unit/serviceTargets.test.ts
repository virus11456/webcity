import { expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import { ServiceSystem } from '../../src/sim/systems/services';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { createCitizens } from '../../src/world/citizens';
import type { Building } from '../../src/world/types';
import type { SimState } from '../../src/sim/state';
import { ReferenceServiceSystem } from '../fixtures/referenceServices';
function fixture() {
  const s = createState({
      seed: 42,
      mapId: 'valley',
      mode: 'sandbox',
      cityName: 'Services',
    }),
    g = new RoadGraph();
  s.terrain.heights.fill(60);
  const road = (ax: number, az: number, bx: number, bz: number) =>
    g.addRoad({
      start: { x: ax, z: az },
      end: { x: bx, z: bz },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  road(-300, 0, 300, 0);
  road(300, 0, 300, 300);
  road(300, 300, -300, 300);
  const b = (
    id: number,
    defId: string,
    x: number,
    z: number,
    kind: Building['kind'] = 'zoned',
  ): Building => ({
    ...structuredClone(districtFixture(1)[0]!),
    id,
    defId,
    kind,
    pos: { x, z },
    rotation: 0,
    state: 'active',
    lotW: 4,
    lotD: 4,
    flags: 7,
    residents: 0,
    jobs: 0,
    workers: 0,
    households: 0,
  });
  s.buildings = [
    b(10001, 'police_station', -200, 8, 'service'),
    b(10002, 'RL', 0, 8),
    b(10003, 'RL', -200, 308),
  ];
  Object.assign(s, g.snapshot());
  s.nextId = 10004;
  const system = new ServiceSystem(s);
  return { s, g, system, b, road };
}

function mixedFixture() {
  const f = fixture(),
    { s, b, road, g } = f;
  road(-300, -300, 300, -300);
  road(-300, -600, 300, -600);
  Object.assign(s, g.snapshot());
  for (const [i, id] of [
    'fire_station',
    'clinic',
    'school_elementary',
    'school_high',
    'university',
  ].entries())
    s.buildings.push(b(11000 + i, id, -120 + i * 40, 8, 'service'));
  for (let i = 0; i < 24; i++) {
    const home = b(
      12000 + i,
      'RH',
      -250 + (i % 6) * 90,
      [8, 308, -292, -592][Math.floor(i / 6)]!,
    );
    home.residents = 100 + i / 10;
    s.buildings.push(home);
  }
  s.citizens = createCitizens(240);
  s.citizens.count = 240;
  for (let i = 0; i < 240; i++) {
    s.citizens.homeId[i] = 12000 + (i % 24);
    s.citizens.education[i] = i % 4;
    s.citizens.age[i] = [6, 13, 19, 30][i % 4]!;
  }
  // Interleave roads independently of IDs to expose changed reduction/patch order.
  s.buildings.reverse();
  return s;
}
const changes: [string, (s: SimState) => void][] = [
  ['mixed providers and disconnected roads', () => {}],
  [
    'budgets and capacity overload',
    (s) => {
      for (const type of ['education', 'health', 'fire', 'police'] as const)
        s.budgets[type] = 0.5;
    },
  ],
  [
    'zero radius',
    (s) => {
      s.budgets.education = s.budgets.police = 0;
    },
  ],
  [
    'closures and abandoned targets',
    (s) => {
      s.buildings[0]!.state = 'abandoned';
      s.buildings.find((b) => b.defId === 'clinic')!.enabled = false;
      s.buildings.find((b) => b.defId === 'school_elementary')!.fire = {
        burning: true,
        damage: 0,
        startedDay: 0,
      };
    },
  ],
  [
    'movement and changed frontage',
    (s) => {
      s.buildings[1]!.pos.z += 500;
      s.buildings[2]!.frontageSetbackM = 400;
    },
  ],
  [
    'removed roads',
    (s) => {
      s.segments = s.segments.slice(2);
    },
  ],
  [
    'curved roads and population changes',
    (s) => {
      s.segments[0]!.c1.z = 90;
      s.segments[0]!.c2.z = -90;
      s.citizens.age.fill(6);
      s.citizens.education.fill(0);
      s.buildings[0]!.residents = 10000.1;
    },
  ],
];
it.each(changes)(
  'matches exhaustive service evaluation for %s',
  (_name, change) => {
    const s = mixedFixture(),
      original = structuredClone(s);
    const actual = new ServiceSystem(s),
      reference = new ReferenceServiceSystem(original);
    const check = () => {
      expect(actual.update()).toEqual(reference.update());
      expect(s.buildings).toEqual(original.buildings);
      expect(s.fields.coverage).toEqual(original.fields.coverage);
    };
    check();
    change(s);
    change(original);
    if (
      _name === 'removed roads' ||
      _name === 'curved roads and population changes'
    ) {
      actual.networkChanged();
      reference.networkChanged();
    }
    check();
    check();
  },
);

it('retains coverage inside the source road when neither endpoint is reached', () => {
  const { s, b } = fixture();
  s.budgets.police = 0.01;
  s.buildings.push(b(10004, 'RH', -198, 8));
  const original = structuredClone(s);
  expect(new ServiceSystem(s).update()).toEqual(
    new ReferenceServiceSystem(original).update(),
  );
  expect(s.buildings.at(-1)!.coverage!.police).toBeGreaterThan(0);
  expect(s.fields.coverage).toEqual(original.fields.coverage);
});
