import type { CitySettings } from './snapshot';
export interface SaveMetadata {
  id: string;
  settings: CitySettings;
  population: number;
  day: number;
  savedAt: number;
  thumbnail: string | null;
}
export interface SaveActions {
  list(): Promise<SaveMetadata[]>;
  save(id: string): Promise<void>;
  load(id: string): Promise<void>;
  exportFile(): Promise<File>;
  importFile(id: string, file: File): Promise<void>;
}
