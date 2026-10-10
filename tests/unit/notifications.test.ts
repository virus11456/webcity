import { expect, it } from 'vitest';
import {
  CityNotices,
  NoticeQueue,
  type CityNotice,
} from '../../src/ui/cityNotices';
import { environmentState } from '../fixtures/environmentCity';
import { financeView } from '../../src/sim/systems/economy';
it('derives real conditions, suppresses persistent issues, re-arms only on recovery and handles demolition', () => {
  const s = environmentState();
  s.buildings[0]!.flags = 0;
  s.buildings[0]!.fire = { burning: true, damage: 0, startedDay: 0 };
  const model = new CityNotices(),
    event = { t: 'ready' as const, reqId: 0, snapshot: s },
    first = model.accept(event);
  expect(first.map((n) => n.code)).toEqual(['noPower', 'noWater', 'fire']);
  expect(first[2]!.pos).toEqual(s.buildings[0]!.pos);
  const patch = {
    t: 'buildingsChanged' as const,
    added: [],
    removed: [],
    updated: [{ id: s.buildings[0]!.id, flags: 0 }],
  };
  expect(model.accept(patch)).toEqual([]);
  expect(
    model.accept({ ...patch, updated: [{ id: s.buildings[0]!.id, flags: 7 }] }),
  ).toEqual([]);
  expect(model.accept(patch).map((n) => n.code)).toEqual([
    'noPower',
    'noWater',
  ]);
  model.accept({
    ...patch,
    removed: s.buildings.map((b) => b.id),
    updated: [],
  });
  expect(
    model
      .accept({ ...patch, added: [s.buildings[0]!], updated: [] })
      .map((n) => n.code),
  ).toContain('fire');
  expect(s.buildings[0]!.flags).toBe(0);
});
it('aggregates abandonment, finance transitions, deduplicates milestones and resets for another city', () => {
  const s = environmentState(),
    b = s.buildings[0]!;
  s.buildings = Array.from({ length: 5 }, (_, i) => ({
    ...structuredClone(b),
    id: 20000 + i,
    state: 'abandoned' as const,
  }));
  const m = new CityNotices();
  expect(
    m.accept({ t: 'ready', reqId: 0, snapshot: s }).map((n) => n.code),
  ).toEqual(['abandoned']);
  s.economy.status = 'warning';
  const e = { t: 'economy' as const, finance: financeView(s) };
  expect(m.accept(e)).toMatchObject([{ code: 'finance', pos: undefined }]);
  expect(m.accept(e)).toEqual([]);
  expect(m.accept({ t: 'milestone', index: 99 })).toHaveLength(1);
  expect(m.accept({ t: 'milestone', index: 99 })).toEqual([]);
  m.accept({ t: 'ready', reqId: 0, snapshot: s });
  expect(m.accept({ t: 'milestone', index: 1 })).toEqual([]); // Sandbox unlocks are already known.
  expect(
    m.accept({ t: 'notify', kind: 'warning', params: { code: 'arbitrary' } }),
  ).toEqual([]);
});
it('caps three cards, prioritizes fire, expires at five seconds and throttles repeated types for sixty seconds', () => {
  const q = new NoticeQueue(),
    n: CityNotice = { key: 'fire', code: 'fire', tone: 'danger' };
  q.push(n, 0);
  for (const key of ['noPower', 'noWater', 'finance', 'abandoned'] as const)
    q.push({ key, code: key, tone: 'warning' }, 1);
  expect(q.visible).toHaveLength(3);
  expect(q.visible[0]!.code).toBe('fire');
  expect(q.push(n, 100)).toBe(false);
  q.dismiss('fire');
  expect(q.push(n, 4999)).toBe(false);
  q.expire(5001);
  expect(q.visible).toHaveLength(0);
  expect(q.push(n, 60000)).toBe(true);
  q.clear();
  expect(q.push(n, 60001)).toBe(true);
});
