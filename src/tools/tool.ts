import type { SimClient } from '../bridge/simClient';
import type { Vec2 } from '../world/types';
import type {
  ConstructionPreview,
  RoadConstructionWorld,
} from '../world/roadConstruction';

export interface ToolPointer {
  x: number;
  y: number;
  kind: string;
  button: number;
  shift?: boolean;
}
export interface ToolContext {
  sim: SimClient;
  pick(x: number, y: number): Vec2 | null;
  preview(result: ConstructionPreview | null, anchor: Vec2 | null): void;
  worldChanged(world: RoadConstructionWorld): void;
}
export interface Tool {
  readonly id: string;
  activate(): void;
  deactivate(): void;
  onPointerDown(event: ToolPointer): void;
  onPointerMove(event: ToolPointer): void;
  onPointerUp(event: ToolPointer): void;
  onCancel(): void;
  onConfirm?(): void;
  onAngleModifier?(disabled: boolean): void;
}
