import { SAVE } from '../data/persistence';
import { SIM_RUNTIME } from '../data/simRuntime';
import type { ImportMetadata } from './fileValidation';

/** Bound input before allocating/decompressing; terminate the validator on every outcome. */
export async function readSaveFile(
  file: File,
): Promise<{ metadata: ImportMetadata; data: ArrayBuffer }> {
  if (file.size < 9 || file.size > SAVE.maxBytes)
    throw new Error('Invalid save size');
  const data = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fileWorker.ts', import.meta.url), {
      type: 'module',
    });
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Import validation timed out'));
    }, SAVE.fileTimeoutMs);
    worker.onmessage = (
      event: MessageEvent<{
        ok: boolean;
        metadata: ImportMetadata;
        data: ArrayBuffer;
      }>,
    ) => {
      finish();
      if (event.data.ok)
        resolve({ metadata: event.data.metadata, data: event.data.data });
      else reject(new Error('Invalid save file'));
    };
    worker.onerror = worker.onmessageerror = () => {
      finish();
      reject(new Error('Import validation failed'));
    };
    try {
      worker.postMessage(data, [data]);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

/** Use a portable basename; cities may contain characters forbidden by file systems. */
export function saveFileName(cityName: string): string {
  const name = cityName
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, SIM_RUNTIME.maxCityNameLength);
  return `WebCity-${name || 'city'}.wcity`;
}
