import { expect, expectTypeOf, it } from 'vitest';
import type { RoadTypeId } from '../../src/data/roads';
import type { ZoneType } from '../../src/data/zones';
import type {
  Building,
  CityStats,
  Fields,
  RoadNode,
  RoadSegment,
  ZoneBlock,
} from '../../src/world/types';

it('world contracts use registry IDs and typed arrays', () => {
  expectTypeOf<RoadSegment['type']>().toEqualTypeOf<RoadTypeId>();
  expectTypeOf<ZoneType>().toEqualTypeOf<
    'RL' | 'RH' | 'CL' | 'CH' | 'I' | 'O'
  >();
  expectTypeOf<ZoneBlock['cells']>().toEqualTypeOf<Uint8Array>();
  expectTypeOf<ZoneBlock['buildingAt']>().toEqualTypeOf<Int32Array>();
  expectTypeOf<Fields['pollution']>().toEqualTypeOf<Float32Array>();
  expectTypeOf<Fields['coverage']['health']>().toEqualTypeOf<Float32Array>();
  expectTypeOf<Building['problemTimers']['noPower']>().toEqualTypeOf<number>();
  expectTypeOf<CityStats['demand']>().toEqualTypeOf<
    Record<'R' | 'C' | 'I' | 'O', number>
  >();
});
it('road and zone state remains mutable and survives worker structured cloning', () => {
  const node: RoadNode = {
    id: 1,
    pos: { x: 0, z: 0 },
    height: 45,
    segments: [2],
    control: 'none',
  };
  const segment: RoadSegment = {
    id: 2,
    type: 'road_small',
    start: 1,
    end: 3,
    c1: { x: 8, z: 0 },
    c2: { x: 16, z: 0 },
    length: 24,
    elevated: false,
    builtDay: 0,
    zoneBlockIds: [4],
  };
  const block: ZoneBlock = {
    id: 4,
    segment: 2,
    side: 1,
    origin: { x: 0, z: 8 },
    dir: { x: 1, z: 0 },
    width: 3,
    cells: new Uint8Array(12),
    buildingAt: new Int32Array(12).fill(-1),
  };
  const cloned = structuredClone({ node, segment, block });
  cloned.node.segments.push(5);
  cloned.block.cells[0] = 1;
  expect(cloned.segment.type).toBe('road_small');
  expect(cloned.block.buildingAt).toBeInstanceOf(Int32Array);
  expect(cloned.block.buildingAt[0]).toBe(-1);
  expect(node.segments).toEqual([2]);
  expect(block.cells[0]).toBe(0);
});
