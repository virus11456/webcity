import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SimClient } from '../../src/bridge/simClient';
import { createSaveController } from '../../src/save/controller';
import { putSave } from '../../src/save/storage';
import { readSaveFile } from '../../src/save/fileTransfer';
vi.mock('../../src/save/storage', () => ({
  listSaves: vi.fn(),
  getSave: vi.fn(),
  putSave: vi.fn(),
}));
vi.mock('../../src/save/fileTransfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/save/fileTransfer')>()),
  readSaveFile: vi.fn(),
}));
const metadata = {
  settings: {
    seed: 72,
    mapId: 'valley',
    mode: 'normal' as const,
    cityName: '備份城',
  },
  population: 6,
  day: 0,
};
const data = new ArrayBuffer(12);
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('document', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  const send = vi.fn().mockResolvedValue({ t: 'saved', data, metadata });
  const controller = createSaveController(
    { send, mirror: {} } as unknown as SimClient,
    () => null,
    vi.fn(),
  );
  return { send, controller };
}
it('exports the worker snapshot without writing any local slot', async () => {
  const { controller, send } = setup();
  const file = await controller.exportFile();
  expect(send).toHaveBeenCalledWith({ t: 'save' });
  expect(file.name).toBe('WebCity-備份城.wcity');
  expect(await file.arrayBuffer()).toEqual(data);
  expect(putSave).not.toHaveBeenCalled();
  controller.dispose();
});
it('writes only validated bytes and metadata to the selected manual slot', async () => {
  const { controller, send } = setup();
  vi.mocked(readSaveFile).mockResolvedValue({ metadata, data });
  await controller.importFile('3', new File(['payload'], 'city.wcity'));
  expect(putSave).toHaveBeenCalledWith(
    { ...metadata, id: '3', thumbnail: null, savedAt: expect.any(Number) },
    data,
  );
  expect(send).not.toHaveBeenCalled();
  controller.dispose();
});
it('rejects invalid files and autosave targets without writing, then allows retry', async () => {
  const { controller } = setup();
  const file = new File(['invalid'], 'city.wcity');
  await expect(controller.importFile('auto', file)).rejects.toThrow();
  expect(readSaveFile).not.toHaveBeenCalled();
  vi.mocked(readSaveFile).mockRejectedValueOnce(new Error('Invalid save'));
  await expect(controller.importFile('0', file)).rejects.toThrow();
  expect(putSave).not.toHaveBeenCalled();
  vi.mocked(readSaveFile).mockResolvedValue({ metadata, data });
  await controller.importFile('0', file);
  expect(putSave).toHaveBeenCalledTimes(1);
  controller.dispose();
});
it('blocks overlapping save/export/import and discards validation after disposal', async () => {
  const { controller } = setup();
  let finish!: (value: {
    metadata: typeof metadata;
    data: ArrayBuffer;
  }) => void;
  vi.mocked(readSaveFile).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const file = new File(['payload'], 'city.wcity');
  const pending = controller.importFile('0', file);
  await expect(controller.save('1')).rejects.toThrow();
  await expect(controller.exportFile()).rejects.toThrow();
  await expect(controller.importFile('1', file)).rejects.toThrow();
  controller.dispose();
  finish({ metadata, data });
  await expect(pending).rejects.toThrow('closed');
  expect(putSave).not.toHaveBeenCalled();
});
it('releases the operation guard after storage failure', async () => {
  const { controller } = setup();
  vi.mocked(readSaveFile).mockResolvedValue({ metadata, data });
  vi.mocked(putSave).mockRejectedValueOnce(new Error('Quota exceeded'));
  await expect(
    controller.importFile('0', new File(['payload'], 'city.wcity')),
  ).rejects.toThrow('Quota');
  await expect(controller.exportFile()).resolves.toBeInstanceOf(File);
  controller.dispose();
});
