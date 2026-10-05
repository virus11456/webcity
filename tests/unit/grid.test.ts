import { expect, it } from 'vitest';
import { Grid } from '../../src/core/grid';

it('round-trips rectangular row-major indices and offset world centers', () => {
  const origin = { x: -16, z: 32 },
    grid = new Grid(3, 2, 8, origin);
  origin.x = 999;
  for (let i = 0; i < 6; i++) {
    const { x, z } = grid.cell(i);
    expect(grid.index(x, z)).toBe(i);
    expect(grid.worldToCell(grid.cellCenter(x, z))).toEqual({ x, z });
  }
  expect(grid.cell(4)).toEqual({ x: 1, z: 1 });
  expect(grid.cellCenter(0, 0)).toEqual({ x: -12, z: 36 });
  expect(new Grid(1, 1, 1).cellCenter(0, 0)).toEqual({ x: 0.5, z: 0.5 });
});
it('uses half-open bounds, rejecting negative-edge and nonfinite positions', () => {
  const grid = new Grid(2, 2, 8);
  expect(grid.worldToCell({ x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
  expect(grid.worldToCell({ x: 8, z: 8 })).toEqual({ x: 1, z: 1 });
  for (const point of [
    { x: -0.01, z: 0 },
    { x: 16, z: 0 },
    { x: 0, z: 16 },
    { x: NaN, z: 0 },
    { x: 0, z: Infinity },
  ])
    expect(grid.worldToCell(point)).toBeNull();
  for (const [x, z] of [
    [-1, 0],
    [0, 2],
    [0.5, 0],
    [0, NaN],
  ]) {
    expect(grid.contains(x!, z!)).toBe(false);
    expect(() => grid.index(x!, z!)).toThrow(RangeError);
  }
  for (const index of [-1, 4, 1.5, NaN])
    expect(() => grid.cell(index)).toThrow(RangeError);
  expect(() => grid.cellCenter(9, 9)).toThrow(RangeError);
});
it('clips four/eight neighbors without wrapping rows', () => {
  const grid = new Grid(3, 3, 1);
  expect(grid.neighbors(4)).toEqual([1, 3, 5, 7]);
  expect(grid.neighbors(4, true)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  expect(grid.neighbors(0, true)).toEqual([1, 3, 4]);
  expect(grid.neighbors(2)).toEqual([1, 5]);
  expect(new Grid(1, 1, 1).neighbors(0)).toEqual([]);
});
it.each([
  [0, 1, 1],
  [1, -1, 1],
  [1.5, 1, 1],
  [1, 1, 0],
  [1, 1, Infinity],
  [Number.MAX_SAFE_INTEGER, 2, 1],
])('rejects invalid grid %s/%s/%s', (w, h, s) =>
  expect(() => new Grid(w, h, s)).toThrow(RangeError),
);
it('rejects a nonfinite origin', () =>
  expect(() => new Grid(1, 1, 1, { x: NaN, z: 0 })).toThrow(RangeError));
