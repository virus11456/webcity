import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseAssetManifest } from '../src/core/assetManifest.ts';

const [, , input, id] = process.argv;
if (!input || !id || !/^[a-z0-9_]+$/.test(id))
  throw new Error('Usage: node scripts/registerAsset.ts input.glb model_id');
const bytes = await readFile(input);
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const url = `models/${id}.${hash}.glb`;
const file = 'public/assets/manifest.json';
const manifest = await readFile(file, 'utf8')
  .then((text) => parseAssetManifest(JSON.parse(text)))
  .catch((error: unknown) => {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return { version: 1 as const, models: [] };
    throw error;
  });
manifest.models = manifest.models.filter((entry) => entry.id !== id);
manifest.models.push({
  id,
  url,
  author: 'WebCity',
  license: 'Original project asset',
});
manifest.models.sort((a, b) => a.id.localeCompare(b.id));
await mkdir('public/assets/models', { recursive: true });
await copyFile(input, `public/assets/${url}`);
await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(url);
