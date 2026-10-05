import { QUALITY, QUALITY_DETECTION, type QualityLevel } from '../data/config';

export interface DeviceProfile {
  userAgent: string;
  touchPoints: number;
  screenWidth: number;
  screenHeight: number;
  gpu: string;
}
/** Parse an explicit quality override, ignoring unsupported values. */
export function qualityOverride(search: string): QualityLevel | null {
  const value = new URLSearchParams(search).get('quality');
  return value === 'low' || value === 'medium' || value === 'high'
    ? value
    : null;
}
/** Choose a conservative initial tier; masked GPU names rely on the startup FPS check. */
export function detectQuality(device: DeviceProfile): QualityLevel {
  const iphone = /iPhone/i.test(device.userAgent);
  const ipad =
    /iPad/i.test(device.userAgent) ||
    (/Macintosh/i.test(device.userAgent) && device.touchPoints > 1);
  if (iphone && /Apple A(?:[5-9]|10|11)(?:\D|$)/i.test(device.gpu))
    return 'low';
  // iPad Pro cannot be identified reliably from UA alone. Use GPU when exposed,
  // otherwise known Pro logical screen sizes; users can always override the tier.
  const longSide = Math.max(device.screenWidth, device.screenHeight);
  const pro =
    ipad &&
    (/Apple (?:M[1-9]|A12[ZX])/i.test(device.gpu) ||
      [1194, 1366, 1210, 1376].includes(longSide));
  if (pro || (!iphone && !ipad && !/Android|Mobile/i.test(device.userAgent)))
    return 'high';
  return 'medium';
}
/** Apply the tier's resolution scale before its DPR cap. */
export function renderPixelRatio(
  level: QualityLevel,
  devicePixelRatio: number,
): number {
  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  return Math.min(dpr * QUALITY[level].resolutionScale, QUALITY[level].maxDpr);
}
/** Measure only visible frames; a reset excludes background-tab time. */
export class StartupQuality {
  private start: number | null = null;
  private frames = 0;
  private complete = false;
  /** Reset an unfinished startup sample after visibility/context changes. */
  reset(): void {
    this.start = null;
    this.frames = 0;
  }
  /** Return low once if the first complete sample is slow, unless quality was forced. */
  sample(nowMs: number, forced: boolean): 'low' | null {
    if (this.complete || forced) return null;
    if (this.start === null) {
      this.start = nowMs;
      return null;
    }
    this.frames++;
    const elapsed = nowMs - this.start;
    if (elapsed < QUALITY_DETECTION.sampleSeconds * 1000) return null;
    this.complete = true;
    return (this.frames * 1000) / elapsed < QUALITY_DETECTION.lowFpsThreshold
      ? 'low'
      : null;
  }
}
