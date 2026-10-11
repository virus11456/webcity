import { BUILDINGS, type BuildingDefinition } from '../data/buildings';
import { PARKS } from '../data/parks';
import { previewFacility, type PowerWorld } from './power';
import { zoneBuildingFootprint } from './zoneGeometry';
import type { Vec2 } from './types';
import type { ServicePreview } from './services';
export const parkDefinition = (id: string): BuildingDefinition | undefined =>
  BUILDINGS.find(
    (d) => d.id === id && (d.kind === 'park' || d.kind === 'unique'),
  );
/** Grid-aligned circular brush sampled along a stroke, with bounded work per segment. */
export function treeBrush(a: Vec2, b: Vec2): Vec2[] {
  const points = new Map<string, Vec2>(),
    spacing = PARKS.treeSpacingM;
  const steps = Math.min(
    PARKS.maxBrushTrees,
    Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / spacing)),
  );
  for (let i = 0; i <= steps && points.size < PARKS.maxBrushTrees; i++) {
    const cx = a.x + ((b.x - a.x) * i) / steps,
      cz = a.z + ((b.z - a.z) * i) / steps;
    for (
      let z = Math.ceil((cz - PARKS.brushRadiusM) / spacing) * spacing;
      z <= cz + PARKS.brushRadiusM;
      z += spacing
    )
      for (
        let x = Math.ceil((cx - PARKS.brushRadiusM) / spacing) * spacing;
        x <= cx + PARKS.brushRadiusM;
        x += spacing
      )
        if (
          Math.hypot(x - cx, z - cz) <= PARKS.brushRadiusM &&
          points.size < PARKS.maxBrushTrees
        )
          points.set(`${x}:${z}`, { x, z });
  }
  return [...points.values()];
}
export function previewTrees(
  w: PowerWorld,
  points: readonly Vec2[],
): ServicePreview {
  const definition = parkDefinition('tree')!,
    seen = new Set<string>(),
    trees: Vec2[] = [];
  let remaining =
    PARKS.maxTrees -
    w.buildings.filter((b) => 'defId' in b && b.defId === 'tree').length;
  for (const p of points.slice(0, PARKS.maxBrushTrees)) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const pos = {
      x: Math.round(p.x / PARKS.treeSpacingM) * PARKS.treeSpacingM,
      z: Math.round(p.z / PARKS.treeSpacingM) * PARKS.treeSpacingM,
    };
    const key = `${pos.x}:${pos.z}`;
    if (seen.has(key) || remaining <= 0) continue;
    seen.add(key);
    const preview = previewFacility({ ...w, money: Infinity }, 'tree', pos, 0, {
      definition,
    });
    if (preview.valid) {
      trees.push(pos);
      remaining--;
    }
  }
  const cost = trees.length * (w.mode === 'sandbox' ? 0 : definition.cost);
  return {
    trees,
    valid: trees.length > 0 && cost <= w.money,
    reason: !trees.length
      ? 'err.buildingConflict'
      : cost > w.money
        ? 'err.notEnoughMoney'
        : null,
    cost,
    output: 0,
    radius: PARKS.brushRadiusM,
    roads: [],
    closed: true,
    points: trees.length
      ? zoneBuildingFootprint({ pos: trees[0]!, rotation: 0, lotW: 1, lotD: 1 })
      : [],
  };
}
