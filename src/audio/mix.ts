import { AUDIO, type AmbienceId, type SoundId } from '../data/soundConfig';
import type { SimEvent } from '../bridge/protocol';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Camera-relative mix, independent of frame rate and simulation authority. */
export function ambientMix(
  height: number,
  industry: number,
  people: number,
  water: number,
  traffic: number,
): Record<AmbienceId, number> {
  const ground =
    1 -
    clamp((height - AUDIO.nearHeight) / (AUDIO.farHeight - AUDIO.nearHeight));
  return {
    wind: 0.06 + (1 - ground) * 0.24,
    traffic: ground * clamp(traffic) * 0.32,
    birds: ground * (1 - clamp(industry)) * 0.22,
    voices: ground * clamp(people) * 0.22,
    industry: ground * clamp(industry) * 0.3,
    water: ground * clamp(water) * 0.3,
  };
}
/** Only confirmed world changes make construction sounds; routine population patches are silent. */
export function effectForEvent(e: SimEvent): SoundId | undefined {
  if (e.t === 'result' && !e.ok) return 'error';
  if (e.t === 'milestone') return 'milestone';
  if (e.t === 'roadsChanged') {
    if (e.added.length) return 'road';
    if (e.removed.length) return 'demolish';
  }
  if (e.t === 'buildingsChanged') {
    if (e.removed.length) return 'demolish';
    if (e.added.some((b) => b.kind !== 'zoned')) return 'place';
  }
}
