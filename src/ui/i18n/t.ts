import { ZH_TW } from './zh-TW';

/** Resolve UI copy from the initial Traditional Chinese dictionary. */
export function t(key: keyof typeof ZH_TW): string {
  return ZH_TW[key];
}
