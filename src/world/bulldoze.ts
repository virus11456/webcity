import { BULLDOZE } from '../data/bulldoze';
import { GAME_MODES, type GameMode } from '../data/config';
import { ABANDONMENT } from '../data/simulation';
import { ROAD_RULES } from '../data/roads';
import { RoadGraph } from './roadGraph';
import type { Building, Id, RoadNode, RoadSegment, ZoneBlock } from './types';
import type { NetworkKind, NetworkSegment } from './snapshot';
import { rebuildZoneGrid } from './zoneGrid';

export type BulldozeKind = 'segment' | 'building' | 'network';
export interface BulldozeTarget {
  kind: BulldozeKind;
  id: Id;
}
export type BulldozeReason = 'err.bulldozeMissing' | 'err.bulldozeLimit';
export interface BulldozeWorld {
  nodes: RoadNode[];
  segments: RoadSegment[];
  zoneBlocks: ZoneBlock[];
  buildings: Building[];
  networks: Record<NetworkKind, NetworkSegment[]>;
  heights: Float32Array;
  nextId: Id;
  day: number;
  mode: GameMode;
}
/** Check untrusted payload shape before allowing object lookup or any mutation. */
export function isBulldozeTargets(value: unknown): value is BulldozeTarget[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= BULLDOZE.maxTargets &&
    value.every(
      (t) =>
        t &&
        typeof t === 'object' &&
        ['segment', 'building', 'network'].includes(t.kind) &&
        Number.isSafeInteger(t.id) &&
        t.id > 0,
    )
  );
}
/** Refund only a documented actual payment, before seven complete game days have elapsed. */
export function demolitionRefund(
  asset: { builtDay?: number; paidCost?: number },
  day: number,
  mode: GameMode,
): number {
  if (
    GAME_MODES[mode].unlimitedMoney ||
    asset.builtDay === undefined ||
    asset.paidCost === undefined ||
    !Number.isSafeInteger(asset.paidCost) ||
    asset.paidCost < 0
  )
    return 0;
  const age = day - asset.builtDay;
  return age >= 0 && age < ROAD_RULES.refundDays
    ? asset.paidCost * ROAD_RULES.refundFraction
    : 0;
}
/** A quote does not reserve a price; the worker recomputes it on release. */
export function quoteBulldoze(
  w: BulldozeWorld,
  targets: readonly BulldozeTarget[],
): { refund: number; cost: number; reason: BulldozeReason | null } {
  let refund = 0,
    cost = 0;
  const seen = new Set<string>();
  for (const t of targets) {
    const key = `${t.kind}:${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const asset =
      t.kind === 'segment'
        ? w.segments.find((s) => s.id === t.id)
        : t.kind === 'building'
          ? w.buildings.find((b) => b.id === t.id)
          : Object.values(w.networks)
              .flat()
              .find((n) => n.id === t.id);
    if (!asset) return { refund: 0, cost: 0, reason: 'err.bulldozeMissing' };
    if (t.kind === 'building') {
      const b = asset as Building;
      if (b.state === 'abandoned' || b.state === 'burned') {
        if (!GAME_MODES[w.mode].unlimitedMoney)
          cost += ABANDONMENT.demolitionPerCell * b.lotW * b.lotD;
        continue;
      }
      if (b.kind === 'zoned') continue;
    }
    refund += demolitionRefund(asset, w.day, w.mode);
  }
  return {
    refund,
    cost,
    reason: targets.length > BULLDOZE.maxTargets ? 'err.bulldozeLimit' : null,
  };
}
/** Pure whole-batch transaction, including topology and zoning cleanup. */
export function planBulldoze(w: BulldozeWorld, targets: BulldozeTarget[]) {
  if (!isBulldozeTargets(targets))
    return { ok: false as const, reason: 'err.invalidCommand' as const };
  const quote = quoteBulldoze(w, targets);
  if (quote.reason) return { ok: false as const, reason: quote.reason };
  const roads = new Set(
    targets.filter((t) => t.kind === 'segment').map((t) => t.id),
  );
  const buildings = new Set(
    targets.filter((t) => t.kind === 'building').map((t) => t.id),
  );
  const networks = new Set(
    targets.filter((t) => t.kind === 'network').map((t) => t.id),
  );
  const change = RoadGraph.previewRemoval(w, [...roads]);
  const changedNodes = new Map(change.nodes.map((n) => [n.id, n])),
    removedNodes = new Set(change.removedNodes);
  const nodes = w.nodes
    .filter((n) => !removedNodes.has(n.id))
    .map((n) => changedNodes.get(n.id) ?? n);
  const remainingBuildings = w.buildings.filter((b) => !buildings.has(b.id));
  const oldBlocks = w.zoneBlocks.map((b) => {
    if (!b.buildingAt.some((id) => buildings.has(id))) return b;
    const copy = structuredClone(b);
    copy.buildingAt.forEach((id, i) => {
      if (buildings.has(id)) copy.buildingAt[i] = -1;
    });
    return copy;
  });
  const zones = rebuildZoneGrid({
    ...w,
    nodes,
    segments: w.segments.filter((s) => !roads.has(s.id)),
    zoneBlocks: oldBlocks,
    buildings: remainingBuildings,
  });
  const anchors = new Map<Id, { zoneBlock: number; blockCell: number }>();
  for (const block of zones.blocks)
    block.buildingAt.forEach((id, index) => {
      if (id !== -1 && !anchors.has(id))
        anchors.set(id, { zoneBlock: block.id, blockCell: index });
    });
  const relinked: Building[] = [];
  const linkedBuildings = remainingBuildings.map((b) => {
    if (b.kind !== 'zoned' || (b.zoneBlock === undefined && !anchors.has(b.id)))
      return b;
    const anchor = anchors.get(b.id);
    if (b.zoneBlock === anchor?.zoneBlock && b.blockCell === anchor?.blockCell)
      return b;
    const next = {
      ...b,
      zoneBlock: anchor?.zoneBlock,
      blockCell: anchor?.blockCell,
    };
    relinked.push(next);
    return next;
  });
  const remainingNetworks = {} as BulldozeWorld['networks'];
  const removedNetworks = {} as Record<NetworkKind, Id[]>;
  for (const kind of Object.keys(w.networks) as NetworkKind[]) {
    remainingNetworks[kind] = w.networks[kind].filter(
      (n) => !networks.has(n.id),
    );
    removedNetworks[kind] = w.networks[kind]
      .filter((n) => networks.has(n.id))
      .map((n) => n.id);
  }
  return {
    ok: true as const,
    ...quote,
    change,
    nodes,
    zones,
    buildings: linkedBuildings,
    relinked,
    networks: remainingNetworks,
    removedBuildings: [...buildings],
    removedNetworks,
  };
}
