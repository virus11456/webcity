import { BUILDING_FORM } from '../data/buildingAppearance';
export type ConstructionStage =
  'foundation' | 'structure' | 'finishing' | 'complete';
export interface ConstructionVisualState {
  progress: number;
  structure: number;
  facade: number;
  stage: ConstructionStage;
  scaffolding: boolean;
}
/** Pure progress mapping; pass caller-owned output to avoid allocations in an animation loop. */
export function constructionVisual(
  progress: number,
  out: ConstructionVisualState = {
    progress: 0,
    structure: 0,
    facade: 0,
    stage: 'foundation',
    scaffolding: false,
  },
): ConstructionVisualState {
  if (!Number.isFinite(progress))
    throw new RangeError('Invalid construction progress');
  const p = Math.max(0, Math.min(1, progress)),
    c = BUILDING_FORM.construction;
  out.progress = p;
  out.structure = Math.min(1, p / c.framingEnd);
  out.facade = Math.max(0, (p - c.facadeStart) / (1 - c.facadeStart));
  out.stage =
    p === 1
      ? 'complete'
      : p >= c.framingEnd
        ? 'finishing'
        : p > 0
          ? 'structure'
          : 'foundation';
  out.scaffolding = p > 0 && p < 1;
  return out;
}
