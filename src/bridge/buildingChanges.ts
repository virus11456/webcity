import type { SimEvent } from './protocol';
/** Construction timers do not change collision geometry or invalidate a held tool gesture. */
export function buildingsChangeFootprints(
  event: Extract<SimEvent, { t: 'buildingsChanged' }>,
): boolean {
  return (
    event.added.length > 0 ||
    event.removed.length > 0 ||
    event.updated.some((p) =>
      ['pos', 'rotation', 'lotW', 'lotD', 'kind', 'defId'].some((key) =>
        Object.hasOwn(p, key),
      ),
    )
  );
}
