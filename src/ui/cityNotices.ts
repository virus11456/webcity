import {
  NOTIFICATIONS as C,
  NOTICE_CODES,
  type NoticeCode,
} from '../data/notifications';
import { hasBuildingProblem } from '../world/buildingProblems';
import type { Building, Vec2 } from '../world/types';
import type { SimEvent } from '../bridge/protocol';
export interface CityNotice {
  key: string;
  code: NoticeCode;
  tone: 'info' | 'warning' | 'danger';
  pos?: Vec2;
  count?: number;
  index?: number;
}
const issues = ['noPower', 'noWater', 'fire', 'abandoned'] as const;
/** Read-only projection of Worker events. Latches conditions until they actually clear. */
export class CityNotices {
  private buildings = new Map<number, Building>();
  private groups = Object.fromEntries(
    issues.map((k) => [k, new Set<number>()]),
  ) as Record<(typeof issues)[number], Set<number>>;
  private active = new Set<string>();
  private milestones = new Set<number>();
  private zoned = new Set<number>();
  private finance = false;
  private update(b: Building) {
    this.buildings.set(b.id, b);
    for (const k of issues) this.groups[k].delete(b.id);
    this.zoned.delete(b.id);
    if (b.kind === 'zoned') this.zoned.add(b.id);
    if (b.state === 'abandoned') this.groups.abandoned.add(b.id);
    if (b.state === 'active')
      for (const k of ['noPower', 'noWater', 'fire'] as const)
        if (hasBuildingProblem(b, k)) this.groups[k].add(b.id);
  }
  accept(e: SimEvent): CityNotice[] {
    if (e.t === 'ready') {
      this.buildings.clear();
      this.zoned.clear();
      this.active.clear();
      for (const k of issues) this.groups[k].clear();
      this.milestones = new Set(e.snapshot.unlocked);
      this.finance = e.snapshot.economy.status !== 'normal';
      for (const b of e.snapshot.buildings) this.update(structuredClone(b));
    } else if (e.t === 'buildingsChanged') {
      for (const id of e.removed) {
        this.buildings.delete(id);
        this.zoned.delete(id);
        for (const k of issues) this.groups[k].delete(id);
      }
      for (const b of e.added) this.update(structuredClone(b));
      for (const patch of e.updated) {
        const old = this.buildings.get(patch.id);
        if (old) this.update({ ...old, ...structuredClone(patch) });
      }
    } else if (e.t === 'economy')
      this.finance = e.finance.economy.status !== 'normal';
    else if (e.t === 'milestone') {
      if (this.milestones.has(e.index)) return [];
      this.milestones.add(e.index);
      const pos = this.buildings.values().next().value?.pos;
      return [
        {
          key: `milestone:${e.index}`,
          code: 'milestone',
          index: e.index,
          tone: 'info',
          pos: pos && { ...pos },
        },
      ];
    } else if (e.t === 'notify') {
      const code = e.params?.code;
      return typeof code === 'string' &&
        NOTICE_CODES.includes(code as NoticeCode)
        ? [
            {
              key: code,
              code: code as NoticeCode,
              tone: e.kind,
              pos: e.pos && { ...e.pos },
            },
          ]
        : [];
    } else return [];
    const notices: CityNotice[] = [];
    for (const code of [...issues, 'finance'] as const) {
      const ids = code === 'finance' ? undefined : this.groups[code],
        count = ids?.size ?? 0;
      const present =
        code === 'finance'
          ? this.finance
          : code === 'abandoned'
            ? count >= C.abandonedMinimum &&
              count / Math.max(1, this.zoned.size) >= C.abandonedFraction
            : count > 0;
      if (!present) {
        this.active.delete(code);
        continue;
      }
      if (this.active.has(code)) continue;
      this.active.add(code);
      const id = ids?.values().next().value,
        pos = id === undefined ? undefined : this.buildings.get(id)?.pos;
      notices.push({
        key: code,
        code,
        count,
        tone: code === 'fire' ? 'danger' : 'warning',
        pos: pos && { ...pos },
      });
    }
    return notices;
  }
}
export interface VisibleNotice extends CityNotice {
  expires: number;
}
/** Real-time expiry and bounded duplicate suppression; no wall clock in the simulation. */
export class NoticeQueue {
  readonly visible: VisibleNotice[] = [];
  private last = new Map<string, number>();
  push(n: CityNotice, now: number): boolean {
    this.expire(now);
    const last = this.last.get(n.key);
    if (last !== undefined && now - last < C.cooldownMs) return false;
    this.last.set(n.key, now);
    this.visible.push({ ...n, expires: now + C.visibleMs });
    this.visible.sort(
      (a, b) =>
        Number(b.tone === 'danger') - Number(a.tone === 'danger') ||
        b.expires - a.expires,
    );
    this.visible.splice(C.maxVisible);
    return true;
  }
  expire(now: number): boolean {
    const before = this.visible.length;
    for (let i = this.visible.length - 1; i >= 0; i--)
      if (this.visible[i]!.expires <= now) this.visible.splice(i, 1);
    for (const [key, at] of this.last)
      if (now - at >= C.cooldownMs) this.last.delete(key);
    return before !== this.visible.length;
  }
  dismiss(key: string) {
    const i = this.visible.findIndex((n) => n.key === key);
    if (i >= 0) this.visible.splice(i, 1);
  }
  clear() {
    this.visible.length = 0;
    this.last.clear();
  }
}
