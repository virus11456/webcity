export interface AssetEntry {
  id: string;
  url: string;
  license: string;
  author: string;
}
export interface AssetManifest {
  version: 1;
  models: AssetEntry[];
}
/** Validate local, versioned model paths before passing a manifest to the loader. */
export function parseAssetManifest(value: unknown): AssetManifest {
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('models' in value) ||
    !Array.isArray(value.models)
  )
    throw new Error('Invalid asset manifest');
  const seen = new Set<string>();
  const models: AssetEntry[] = value.models.map((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('id' in entry) ||
      typeof entry.id !== 'string' ||
      !/^[a-z0-9_]+$/.test(entry.id) ||
      seen.has(entry.id) ||
      !('url' in entry) ||
      typeof entry.url !== 'string' ||
      !/^models\/[a-z0-9_]+\.[a-f0-9]{12}\.glb$/.test(entry.url) ||
      !('license' in entry) ||
      typeof entry.license !== 'string' ||
      !entry.license ||
      !('author' in entry) ||
      typeof entry.author !== 'string' ||
      !entry.author
    )
      throw new Error('Invalid asset entry');
    seen.add(entry.id);
    return {
      id: entry.id,
      url: entry.url,
      license: entry.license,
      author: entry.author,
    };
  });
  return { version: 1, models };
}
