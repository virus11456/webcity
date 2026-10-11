import { describe, it, expect } from 'vitest';
import { INDUSTRY_SPECIALIZATIONS as TYPES } from '../../src/data/policies';
import { busState } from '../fixtures/busCity';
import { districtCell } from '../../src/world/districts';
import { industryResource, industryAt } from '../../src/world/industry';
import { updateIndustry } from '../../src/sim/systems/industry';
import { districtCommand } from '../../src/sim/systems/districts';
import { jobPlaces, buildingCapacity } from '../../src/world/population';
import { updatePollution } from '../../src/sim/systems/fields';
import { generateBuilding } from '../../src/render/buildings/generator';
import { catalogModel } from '../../src/world/modelCatalog';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import { Simulation } from '../../src/sim/simulation';
function fixture() {
  const s = busState(),
    b = s.buildings[1]!;
  s.districts = [
    { id: s.nextId++, name: 'Industry', cells: [districtCell(b.pos)] },
  ];
  return { s, b, d: s.districts[0]! };
}
describe('district industry specializations', () => {
  it.each(TYPES)(
    '$id samples its own resource, favors lower education and has original geometry',
    (def) => {
      const { s, b, d } = fixture();
      d.industry = def.id;
      expect(industryAt(s.districts, b)).toBe(def.id);
      updateIndustry(s);
      for (const field of Object.values(s.terrain.resources)) field.fill(0);
      expect(industryResource(b, s.terrain.resources)).toBe(0);
      s.terrain.resources[def.resource][districtCell(b.pos)] = 255;
      expect(industryResource(b, s.terrain.resources)).toBe(1);
      const jobs = jobPlaces(b);
      expect(jobs[3]).toBe(0);
      expect(jobs[0]).toBeGreaterThan(jobs[1]);
      expect(jobs.reduce((a, b) => a + b, 0)).toBe(buildingCapacity(b));
      expect(catalogModel(b)).toBeUndefined();
      const g = generateBuilding('I', 3, 4, 4, 42, true, undefined, def.id),
        far = generateBuilding('I', 3, 4, 4, 42, false, undefined, def.id);
      expect(g.userData.industry).toBe(def.id);
      expect(g.userData.massing).toEqual(far.userData.massing);
      expect(g.getAttribute('position').count).toBeGreaterThan(100);
      expect(far.getAttribute('position').count).toBe(0);
      expect(g.boundingBox!.min.x).toBeGreaterThanOrEqual(-16);
      expect(g.boundingBox!.max.z).toBeLessThanOrEqual(0);
      g.dispose();
      far.dispose();
    },
  );
  it('locks specialization until MS6, permits sandbox, and retires stock on conversion/deletion', () => {
    const { s, b, d } = fixture();
    s.settings.mode = 'normal';
    s.unlocked = [0, 1, 2];
    expect(
      districtCommand(s, {
        action: 'specialize',
        id: d.id,
        industry: 'industry_oil',
      }),
    ).toMatchObject({ ok: false, reason: 'err.locked' });
    s.unlocked.push(6);
    expect(
      districtCommand(s, {
        action: 'specialize',
        id: d.id,
        industry: 'industry_oil',
      }).ok,
    ).toBe(true);
    b.cargo = {
      stock: 52,
      capacity: 120,
      shortage: false,
      exportBlocked: true,
    };
    expect(updateIndustry(s)[0]).toMatchObject({
      industry: 'industry_oil',
      cargo: { stock: 0 },
    });
    expect(s.cargo.lost).toBe(52);
    expect(updateIndustry(s)).toEqual([]);
    expect(s.cargo.lost).toBe(52);
    districtCommand(s, { action: 'delete', id: d.id });
    expect(updateIndustry(s)[0]).toHaveProperty('industry', undefined);
    expect(b.industry).toBeUndefined();
  });
  it('keeps residential buildings ordinary and emits distinct pollution for each specialization', () => {
    const emissions = TYPES.map((def) => {
      const { s, b, d } = fixture();
      d.industry = def.id;
      updateIndustry(s);
      s.buildings = [b];
      b.jobs = 40;
      s.fields.pollution.fill(0);
      updatePollution(s);
      return s.fields.pollution.reduce((a, b) => a + b, 0);
    });
    expect(emissions[1]).toBe(0);
    expect(emissions[0]).toBeLessThan(emissions[2]!);
    expect(emissions[2]).toBeLessThan(emissions[3]!);
    const { s, b, d } = fixture();
    d.industry = 'industry_oil';
    b.defId = 'RL';
    updateIndustry(s);
    expect(b.industry).toBeUndefined();
  });
  it('round-trips district and derived building industry and rejects corrupt ids', async () => {
    const { s, d } = fixture();
    d.industry = 'industry_farming';
    const sim = new Simulation(s.settings, undefined, s);
    const saved = await deserialize(await serialize(sim.snapshot()));
    expect(saved.districts[0]!.industry).toBe('industry_farming');
    expect(saved.buildings[1]!.industry).toBe('industry_farming');
    Reflect.set(saved.districts[0]!, 'industry', 'invalid');
    expect(() => migrateSave(saved, 1)).toThrow();
  });
});
