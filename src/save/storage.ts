import { openDB, type DBSchema } from 'idb';
import { SAVE } from '../data/persistence';
import type { SaveMetadata } from '../world/saveTypes';
interface Saves extends DBSchema {
  slots: { key: string; value: SaveMetadata };
  data: { key: string; value: ArrayBuffer };
}
const valid = (id: string) => id === SAVE.autoId || /^(?:[0-9])$/.test(id);
const db = () =>
  openDB<Saves>('webcity-saves', 1, {
    upgrade(database) {
      database.createObjectStore('slots', { keyPath: 'id' });
      database.createObjectStore('data');
    },
  });
/** List metadata only, so opening the menu never decompresses all saved cities. */
export async function listSaves(): Promise<SaveMetadata[]> {
  const database = await db();
  try {
    return await database.getAll('slots');
  } finally {
    database.close();
  }
}
/** Store metadata and payload atomically, retaining the old save if quota/write fails. */
export async function putSave(
  metadata: SaveMetadata,
  data: ArrayBuffer,
): Promise<void> {
  if (!valid(metadata.id)) throw new Error('Invalid save slot');
  const database = await db();
  try {
    const tx = database.transaction(['slots', 'data'], 'readwrite');
    await Promise.all([
      tx.objectStore('slots').put(metadata),
      tx.objectStore('data').put(data, metadata.id),
    ]);
    await tx.done;
  } finally {
    database.close();
  }
}
/** Read a complete slot, rejecting missing metadata or binary data. */
export async function getSave(
  id: string,
): Promise<{ metadata: SaveMetadata; data: ArrayBuffer }> {
  if (!valid(id)) throw new Error('Invalid save slot');
  const database = await db();
  try {
    const tx = database.transaction(['slots', 'data']);
    const [metadata, data] = await Promise.all([
      tx.objectStore('slots').get(id),
      tx.objectStore('data').get(id),
    ]);
    await tx.done;
    if (!metadata || !data) throw new Error('Missing save');
    return { metadata, data };
  } finally {
    database.close();
  }
}
