import {
  PlaceTool,
  type PowerToolContext,
  type PowerToolState,
} from './placeTool';
/** Two endpoint overhead power line placement with an explicit confirmation. */
export class NetworkTool extends PlaceTool {
  constructor(ctx: PowerToolContext, changed: (s: PowerToolState) => void) {
    super(ctx, changed, true);
  }
}
