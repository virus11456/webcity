import { deserialize } from './serializer';
import type { SaveMetadata } from '../world/saveTypes';

export type ImportMetadata = Pick<
  SaveMetadata,
  'settings' | 'population' | 'day'
>;
/** Fully validate in an isolated Worker without changing the running simulation. */
export async function validateSaveImport(
  data: ArrayBuffer,
): Promise<ImportMetadata> {
  const snapshot = await deserialize(data);
  return {
    settings: snapshot.settings,
    population: snapshot.stats.population,
    day: snapshot.clock.day,
  };
}
