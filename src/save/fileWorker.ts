import { validateSaveImport } from './fileValidation';

globalThis.addEventListener(
  'message',
  async (event: MessageEvent<ArrayBuffer>) => {
    try {
      const metadata = await validateSaveImport(event.data);
      globalThis.postMessage(
        { ok: true, metadata, data: event.data },
        { transfer: [event.data] },
      );
    } catch {
      globalThis.postMessage({ ok: false });
    }
  },
);
