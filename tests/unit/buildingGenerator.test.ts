import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateBuilding } from '../../src/render/buildings/generator';
import { atlasUV } from '../../src/render/buildings/geometry';
import {
  BUILDING_FORM as F,
  BUILDING_ZONES,
} from '../../src/data/buildingAppearance';
import { buildingCatalog } from '../../src/world/buildingCatalog';
import { constructionVisual } from '../../src/world/constructionVisual';
import type { BufferGeometry } from 'three';
const hash = (g: BufferGeometry) => {
  const h = createHash('sha256');
  for (const key of ['position', 'normal', 'color', 'uv']) {
    const a = g.getAttribute(key).array;
    h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  return h.digest('hex');
};
describe('deterministic building catalog', () => {
  it('enumerates every legal zone × level × footprint exactly once', () => {
    const all = buildingCatalog(1);
    expect(all).toHaveLength(164);
    expect(
      new Set(all.map((s) => `${s.zone}:${s.level}:${s.w}:${s.d}`)).size,
    ).toBe(164);
    expect(
      Object.fromEntries(
        BUILDING_ZONES.map((z) => [z, all.filter((s) => s.zone === z).length]),
      ),
    ).toEqual({ RL: 20, RH: 45, CL: 18, CH: 27, I: 27, O: 27 });
  });
  it.each(BUILDING_ZONES)(
    '%s is deterministic, colored, finite, within its lot and triangle budget across every legal shape',
    (zone) => {
      for (const spec of buildingCatalog(91).filter((s) => s.zone === zone))
        for (const seed of [0, 1, 91, 0xffffffff]) {
          const { level, w, d } = spec,
            g = generateBuilding(zone, level, w, d, seed),
            again = generateBuilding(zone, level, w, d, seed);
          expect(hash(g)).toBe(hash(again));
          const p = g.getAttribute('position'),
            n = g.getAttribute('normal'),
            uv = g.getAttribute('uv'),
            colors = g.getAttribute('color');
          expect(p.count / 3).toBeLessThanOrEqual(F.budgets[zone]);
          expect(p.count).toBeGreaterThan(36);
          for (const a of [p, n, uv, colors])
            for (const value of a.array)
              expect(Number.isFinite(value)).toBe(true);
          for (const value of uv.array) {
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThan(1);
          }
          for (let i = 0; i < n.count; i++)
            expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(
              1,
              5,
            );
          expect(g.boundingBox!.min.x).toBeGreaterThanOrEqual(-w * 4 - 0.001);
          expect(g.boundingBox!.max.x).toBeLessThanOrEqual(w * 4 + 0.001);
          expect(g.boundingBox!.min.z).toBeGreaterThanOrEqual(-d * 8 - 0.001);
          expect(g.boundingBox!.max.z).toBeLessThanOrEqual(0.001);
          expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(0);
          const range = F.floors[zone][level - 1]!;
          expect(g.userData.floors).toBeGreaterThanOrEqual(range[0]);
          expect(g.userData.floors).toBeLessThanOrEqual(range[1]);
          g.dispose();
          again.dispose();
        }
    },
    30000,
  );
  it.each(BUILDING_ZONES)(
    '%s changes with seed while earlier calls cannot influence regeneration',
    (zone) => {
      const a = generateBuilding(zone, 2, 2, 2, 1),
        b = generateBuilding(zone, 2, 2, 2, 2),
        c = generateBuilding(zone, 2, 2, 2, 1);
      expect(hash(a)).not.toBe(hash(b));
      expect(hash(a)).toBe(hash(c));
      for (const g of [a, b, c]) g.dispose();
    },
  );
  it('rejects invalid levels, zone footprints and seeds', () => {
    expect(() => generateBuilding('RL', 6, 2, 2, 1)).toThrow(RangeError);
    expect(() => generateBuilding('RL', 1, 4, 4, 1)).toThrow(RangeError);
    expect(() => generateBuilding('O', 4, 2, 2, 1)).toThrow(RangeError);
    expect(() => generateBuilding('I', 1, 1, 1, 1)).toThrow(RangeError);
    expect(() => generateBuilding('CL', 1, 2, 2, NaN)).toThrow(RangeError);
  });
  it('windows address their zone row and stay away from adjacent tiles', () => {
    for (const [row, zone] of BUILDING_ZONES.entries())
      for (let v = 0; v < F.windowVariants; v++)
        for (const [u, y] of atlasUV(zone, v)) {
          expect(u).toBeGreaterThan(v / 8);
          expect(u).toBeLessThan((v + 1) / 8);
          expect(y).toBeGreaterThan(1 - (row + 2) / 8);
          expect(y).toBeLessThan(1 - (row + 1) / 8);
        }
    expect(atlasUV()[0][1]).toBeGreaterThan(7 / 8);
  });
});
describe('continuous construction stages', () => {
  it('reuses caller-owned animation state without allocating another object', () => {
    const out = constructionVisual(0);
    expect(constructionVisual(0.5, out)).toBe(out);
    expect(out.stage).toBe('structure');
  });
  it.each([
    [0, 'foundation'],
    [0.5, 'structure'],
    [0.9, 'finishing'],
    [1, 'complete'],
  ] as const)('progress %s displays %s', (p, stage) => {
    expect(constructionVisual(p).stage).toBe(stage);
    expect(constructionVisual(p).scaffolding).toBe(p > 0 && p < 1);
  });
  it('frame always precedes facade and both advance monotonically to completion', () => {
    let oldFrame = 0,
      oldFacade = 0;
    for (let n = 0; n <= 100; n++) {
      const s = constructionVisual(n / 100);
      expect(s.structure).toBeGreaterThanOrEqual(s.facade);
      expect(s.structure).toBeGreaterThanOrEqual(oldFrame);
      expect(s.facade).toBeGreaterThanOrEqual(oldFacade);
      oldFrame = s.structure;
      oldFacade = s.facade;
    }
    expect(oldFrame).toBe(1);
    expect(oldFacade).toBe(1);
  });
  it('clamps finite progress and rejects invalid clocks', () => {
    expect(constructionVisual(-1).stage).toBe('foundation');
    expect(constructionVisual(2).stage).toBe('complete');
    expect(() => constructionVisual(NaN)).toThrow(RangeError);
  });
});
