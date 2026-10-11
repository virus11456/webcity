import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { BUILDINGS } from '../../src/data/buildings';
import { facilityModels, facilityModel } from '../../src/world/facilityModels';
import {
  facilityGeometry,
  facilityRotor,
} from '../../src/render/facilities/geometry';
import { parseAssetManifest } from '../../src/core/assetManifest';
it('covers every placeable building ID and twelve distinct original landmarks', () => {
  expect(facilityModels).toHaveLength(BUILDINGS.length);
  expect(new Set(facilityModels.map((m) => m.id)).size).toBe(42);
  for (const d of BUILDINGS)
    expect(facilityModel(d.id)?.id).toBe(`svc_${d.id}`);
  expect(facilityModel('missing')).toBeUndefined();
  const shapes = facilityModels
    .filter((m) => m.landmark !== undefined)
    .map((m) => {
      const g = facilityGeometry(m, 0);
      const hash = createHash('sha256')
        .update(Buffer.from(g.getAttribute('position').array.buffer))
        .digest('hex');
      g.dispose();
      return hash;
    });
  expect(new Set(shapes).size).toBe(12);
});
it('keeps all facility geometry within three LOD budgets and front-centre ground origin', () => {
  for (const m of facilityModels)
    for (const lod of [0, 1, 2] as const) {
      const g = facilityGeometry(m, lod);
      let count = g.getAttribute('position').count / 3;
      if (m.defId === 'power_wind' && lod < 2) {
        const rotor = facilityRotor(lod as 0 | 1);
        count += rotor.getAttribute('position').count / 3;
        rotor.dispose();
      }
      expect(count, `${m.id}/LOD${lod}`).toBeLessThanOrEqual(
        (m.defId === 'tree' ? [400, 60, 12] : [1500, 300, 12])[lod]!,
      );
      expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(g.boundingBox!.max.z).toBeLessThanOrEqual(0.01);
      expect(g.boundingBox!.min.z).toBeLessThan(0);
      g.dispose();
    }
});
it('ships all 42 hash-addressed compressed GLBs with shared civic atlases and a separate wind rotor', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const manifest = parseAssetManifest(
    JSON.parse(await readFile('public/assets/manifest.json', 'utf8')),
  );
  const atlases = new Set<string>();
  for (const m of facilityModels) {
    const e = manifest.models.find((e) => e.id === m.id)!;
    expect(e).toBeDefined();
    const bytes = await readFile(`public/assets/${e.url}`);
    expect(e.url).toContain(
      createHash('sha256').update(bytes).digest('hex').slice(0, 12),
    );
    const root = (await io.readBinary(bytes)).getRoot();
    expect(root.listExtensionsUsed().map((e) => e.extensionName)).toContain(
      'EXT_meshopt_compression',
    );
    expect(root.listNodes().map((n) => n.getName())).toEqual(
      expect.arrayContaining(['LOD0', 'LOD1', 'LOD2']),
    );
    if (m.defId === 'power_wind')
      expect(root.listNodes().map((n) => n.getName())).toContain('Rotor0');
    expect(root.listTextures()).toHaveLength(2);
    for (const t of root.listTextures()) {
      expect(t.getMimeType()).toBe('image/ktx2');
      atlases.add(createHash('sha256').update(t.getImage()!).digest('hex'));
    }
    for (const mat of root.listMaterials()) {
      expect(mat.getRoughnessFactor()).toBe(0.85);
      expect(mat.getMetallicFactor()).toBe(0);
    }
  }
  expect(atlases.size).toBe(2);
}, 15000);
