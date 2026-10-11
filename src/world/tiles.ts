import { MAP_TILES, WORLD } from '../data/config';
import { MILESTONES, TILE_PURCHASE } from '../data/milestones';
export interface TileWorld {
  ownedTiles: readonly number[];
  unlocked: readonly number[];
  tileLimit: 4 | 9;
  money: number;
  settings: { mode: string };
}
export const deviceTileLimit = (userAgent: string): 4 | 9 =>
  /iPhone|iPod/i.test(userAgent)
    ? WORLD.maxOwnedTiles.iphone
    : WORLD.maxOwnedTiles.desktop;
export function tileAllowance(w: TileWorld): number {
  return Math.min(
    w.tileLimit,
    w.settings.mode === 'sandbox'
      ? WORLD.maxOwnedTiles.desktop
      : Math.max(
          1,
          ...MILESTONES.filter((m) => w.unlocked.includes(m.id)).map(
            (m) => m.maxOwnedTiles,
          ),
        ),
  );
}
export function tilePrice(ownedCount: number): number {
  return (
    TILE_PURCHASE.secondTileCost +
    Math.max(0, ownedCount - 1) * TILE_PURCHASE.costIncrement
  );
}
export type TileReason =
  | 'err.tileOwned'
  | 'err.tileAdjacent'
  | 'err.tileLimit'
  | 'err.locked'
  | 'err.notEnoughMoney'
  | 'err.invalidCommand';
export function previewTile(
  w: TileWorld,
  tx: number,
  tz: number,
): { ok: boolean; cost: number; reason?: TileReason } {
  const cost =
    w.settings.mode === 'sandbox' ? 0 : tilePrice(w.ownedTiles.length);
  const fail = (reason: TileReason) => ({ ok: false, cost, reason });
  if (
    !Number.isInteger(tx) ||
    !Number.isInteger(tz) ||
    tx < 0 ||
    tz < 0 ||
    tx >= MAP_TILES ||
    tz >= MAP_TILES
  )
    return fail('err.invalidCommand');
  const id = tz * MAP_TILES + tx;
  if (w.ownedTiles.includes(id)) return fail('err.tileOwned');
  if (
    !w.ownedTiles.some(
      (n) =>
        Math.abs((n % MAP_TILES) - tx) +
          Math.abs(Math.floor(n / MAP_TILES) - tz) ===
        1,
    )
  )
    return fail('err.tileAdjacent');
  if (w.ownedTiles.length >= w.tileLimit) return fail('err.tileLimit');
  if (w.ownedTiles.length >= tileAllowance(w)) return fail('err.locked');
  if (cost > w.money) return fail('err.notEnoughMoney');
  return { ok: true, cost };
}
