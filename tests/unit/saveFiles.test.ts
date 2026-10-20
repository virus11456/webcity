import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { validateSaveImport } from '../../src/save/fileValidation';
import { readSaveFile, saveFileName } from '../../src/save/fileTransfer';
import { SAVE } from '../../src/data/persistence';

it('validates an archived file and derives metadata from its payload', async () => {
  const bytes = new Uint8Array(
    await readFile(new URL('../fixtures/saves/v1-m5.wcity', import.meta.url)),
  );
  expect(await validateSaveImport(bytes.buffer)).toEqual({
    settings: {
      seed: 72,
      mapId: 'valley',
      mode: 'normal',
      cityName: '歷史存檔回歸城',
    },
    population: 6,
    day: 0,
  });
});
it('rejects future versions, truncated payloads and invalid headers', async () => {
  const bytes = new Uint8Array(
    await readFile(new URL('../fixtures/saves/v1-m5.wcity', import.meta.url)),
  );
  const future = bytes.slice();
  new DataView(future.buffer).setUint32(4, SAVE.version + 1, true);
  await expect(validateSaveImport(future.buffer)).rejects.toThrow('version');
  await expect(validateSaveImport(bytes.slice(0, 24).buffer)).rejects.toThrow();
  bytes[0] = 0;
  await expect(validateSaveImport(bytes.buffer)).rejects.toThrow('header');
});
it.each([0, 8, SAVE.maxBytes + 1])(
  'rejects %i bytes before reading or starting a worker',
  async (size) => {
    const arrayBuffer = vi.fn();
    await expect(
      readSaveFile({ size, arrayBuffer } as unknown as File),
    ).rejects.toThrow('size');
    expect(arrayBuffer).not.toHaveBeenCalled();
  },
);
it('creates portable names without path traversal, control characters or lost extension', () => {
  expect(saveFileName('../海港:城\\?\n')).toBe('WebCity-_海港_城___.wcity');
  expect(saveFileName('... ')).toBe('WebCity-city.wcity');
  expect(saveFileName('城'.repeat(100))).toBe(
    `WebCity-${'城'.repeat(64)}.wcity`,
  );
});
