import { INDUSTRY_SPECIALIZATIONS } from '../../data/policies';
import { DISTRICTS as D } from '../../data/districts';
import { FEATURES } from '../../data/milestones';
import { MAP_SIZE, GAME_MODES } from '../../data/config';
import { districtBrush, paintDistrict } from '../../world/districts';
import type { SimState } from '../state';
import type { Result } from '../../bridge/protocol';
import type { DistrictAction } from '../../world/districts';
export function districtCommand(
  s: SimState,
  c: DistrictAction,
): Omit<Result, 't' | 'reqId'> {
  if (
    !GAME_MODES[s.settings.mode].allUnlocked &&
    !s.unlocked.includes(FEATURES.find((f) => f.id === 'district_tool')!.unlock)
  )
    return { ok: false, reason: 'err.locked' };
  if ('name' in c && (!c.name.trim() || c.name.trim().length > D.maxName))
    return { ok: false, reason: 'err.districtName' };
  if (c.action === 'create') {
    if (s.districts.length >= D.maxCount)
      return { ok: false, reason: 'err.districtLimit' };
    s.districts = [
      ...s.districts,
      { id: s.nextId++, name: c.name.trim(), cells: [] },
    ];
  } else {
    if (c.id !== null && !s.districts.some((d) => d.id === c.id))
      return { ok: false, reason: 'err.invalidCommand' };
    if (c.action === 'rename')
      s.districts = s.districts.map((d) =>
        d.id === c.id ? { ...d, name: c.name.trim() } : d,
      );
    else if (c.action === 'delete')
      s.districts = s.districts.filter((d) => d.id !== c.id);
    else if (c.action === 'specialize') {
      const def = INDUSTRY_SPECIALIZATIONS.find((d) => d.id === c.industry);
      if (c.industry !== null && !def)
        return { ok: false, reason: 'err.invalidCommand' };
      if (!GAME_MODES[s.settings.mode].allUnlocked && !s.unlocked.includes(6))
        return { ok: false, reason: 'err.locked' };
      s.districts = s.districts.map((d) =>
        d.id === c.id ? { ...d, industry: def?.id } : d,
      );
    } else {
      if (
        c.points.some(
          (p) =>
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.z) ||
            Math.abs(p.x) > MAP_SIZE / 2 ||
            Math.abs(p.z) > MAP_SIZE / 2,
        )
      )
        return { ok: false, reason: 'err.invalidCommand' };
      if (
        ![D.smallRadiusM, D.largeRadiusM].includes(c.radius as 32 | 96) ||
        !c.points.length ||
        c.points.length > D.maxStrokePoints
      )
        return { ok: false, reason: 'err.invalidCommand' };
      const cells = districtBrush(c.points, c.radius, s.ownedTiles);
      if (!cells.length) return { ok: false, reason: 'err.landNotOwned' };
      s.districts = paintDistrict(s.districts, c.id, cells);
    }
  }
  return { ok: true };
}
