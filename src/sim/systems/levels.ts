import {
  GROWTH,
  UPGRADE_REQUIREMENTS,
  ZONES,
  type ZoneType,
} from '../../data/zones';
import { POWER } from '../../data/power';
import { WATER_UTILITY } from '../../data/waterUtility';
import { residential } from '../../world/population';
import type { Building } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
import { garbageCollected } from './happiness';
export function upgradeStatus(b: Building): NonNullable<Building['upgrade']> {
  const max = ZONES[b.defId as ZoneType].maxLevel;
  const goal = UPGRADE_REQUIREMENTS.find(
    (r) => r.level === b.level + 1 && r.level <= max,
  );
  const employees = b.workerEducation ?? [0, 0, 0, 0];
  const count = employees.reduce((a, n) => a + n, 0);
  const education = residential(b)
    ? (b.housing?.averageEducation ?? 0)
    : count
      ? employees.reduce((a, n, i) => a + n * i, 0) / count
      : 0;
  const required = goal
    ? residential(b)
      ? goal.residentEducation
      : (goal.workerEducation ?? 0)
    : 0;
  const utilities =
    !!(b.flags & POWER.flag) &&
    !!(b.flags & WATER_UTILITY.waterFlag) &&
    garbageCollected(b);
  return {
    target: goal?.level ?? b.level,
    landRequired: goal?.landValue ?? 0,
    education,
    educationRequired: required,
    utilities,
    progress: !goal
      ? 1
      : utilities
        ? Math.min(
            1,
            (b.landValue ?? 0) / goal.landValue,
            required ? education / required : 1,
          )
        : 0,
  };
}
/** Daily guards persist so reload, pause and structural refresh never accelerate development. */
export function updateLevels(s: SimState, daily = false): BuildingPatch[] {
  const patches: BuildingPatch[] = [];
  for (const b of s.buildings) {
    if (b.kind !== 'zoned' || !Object.hasOwn(ZONES, b.defId)) continue;
    const before = JSON.stringify([b.level, b.development, b.upgrade]);
    const d = (b.development ??= {
      lastDay: -1,
      lastCheckDay: b.builtDay ?? s.clock.day,
    });
    if (daily && d.lastDay !== s.clock.day) {
      d.lastDay = s.clock.day;
      if (
        b.state === 'active' &&
        !b.fire?.burning &&
        b.rezoneAtTick === undefined
      ) {
        const threshold = UPGRADE_REQUIREMENTS.find(
          (r) => r.level === b.level,
        )?.landValue;
        if (
          threshold !== undefined &&
          (b.landValue ?? 0) < threshold - GROWTH.downgradeLandValueMargin
        )
          d.lowValueSinceDay ??= s.clock.day;
        else delete d.lowValueSinceDay;
        if (
          d.lowValueSinceDay !== undefined &&
          s.clock.day - d.lowValueSinceDay >= GROWTH.downgradeDays
        ) {
          b.level--;
          d.changedDay = s.clock.day;
          d.lastCheckDay = s.clock.day;
          delete d.lowValueSinceDay;
        } else if (s.clock.day - d.lastCheckDay >= GROWTH.upgradeCheckDays) {
          d.lastCheckDay = s.clock.day;
          const q = upgradeStatus(b);
          if (q.target > b.level && q.progress >= 1) {
            b.level++;
            d.changedDay = s.clock.day;
            delete d.lowValueSinceDay;
          }
        }
      } else {
        delete d.lowValueSinceDay;
        d.lastCheckDay = s.clock.day;
      }
    }
    b.upgrade = upgradeStatus(b);
    if (JSON.stringify([b.level, b.development, b.upgrade]) !== before)
      patches.push({
        id: b.id,
        level: b.level,
        development: { ...d },
        upgrade: { ...b.upgrade },
      });
  }
  return patches;
}
