import type { Tool } from './tool';

/** Exactly one tool owns single-pointer input; null restores camera exploration. */
export class ToolManager {
  private active: Tool | null = null;
  constructor(private readonly connect: (tool: Tool | null) => void) {}
  /** Change input owner and cancel the prior unfinished gesture. */
  select(tool: Tool | null): void {
    if (tool === this.active) return;
    this.active?.deactivate();
    this.active = tool;
    this.connect(tool);
    tool?.activate();
  }
  /** Release the current input owner. */
  dispose(): void {
    this.select(null);
  }
}
