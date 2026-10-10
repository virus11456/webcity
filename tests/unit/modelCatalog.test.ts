import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  catalogModel,
  catalogModels,
  visualSeed,
} from '../../src/world/modelCatalog';
import { catalogGeometry } from '../../src/render/buildings/catalogGeometry';
import { parseAssetManifest } from '../../src/core/assetManifest';
it('maps all 189 residential, commercial, industrial and office recipes deterministically, preserving unsupported lots as procedural', () => {
  const models = catalogModels();
  expect(models.filter((m) => m.zone === 'RL')).toHaveLength(60);
  expect(models.filter((m) => m.zone === 'RH')).toHaveLength(30);
  expect(new Set(models.map((m) => m.id)).size).toBe(189);
  for (const [zone, count] of [
    ['CL', 36],
    ['CH', 18],
    ['I', 27],
    ['O', 18],
  ] as const)
    expect(models.filter((m) => m.zone === zone)).toHaveLength(count);
  for (const m of models) {
    const b = {
      defId: m.zone,
      level: m.level,
      lotW: m.w,
      lotD: m.d,
      seed: m.variant - 1,
    };
    expect(catalogModel(b)?.id).toBe(m.id);
    expect(visualSeed(b)).toBe(m.seed);
  }
  const unknown = { defId: 'RH', level: 1, lotW: 2, lotD: 3, seed: 125 };
  expect(catalogModel(unknown)).toBeUndefined();
  expect(visualSeed(unknown)).toBe(125);
});
it('keeps authored origins, palettes and LOD triangle budgets across every catalog recipe', () => {
  for (const model of catalogModels())
    for (const lod of [0, 1, 2] as const) {
      const g = catalogGeometry(model, lod),
        tris = (g.index?.count ?? g.getAttribute('position').count) / 3;
      expect(tris).toBeLessThanOrEqual(
        (['RL', 'CL', 'I'].includes(model.zone)
          ? [1500, 300, 12]
          : [4000, 600, 24])[lod]!,
      );
      expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(g.boundingBox!.min.z).toBeLessThan(0);
      expect(g.boundingBox!.max.z).toBeLessThanOrEqual(0.01);
      expect(g.boundingBox!.min.x).toBeGreaterThanOrEqual(-model.w * 4 - 0.01);
      expect(g.boundingBox!.max.x).toBeLessThanOrEqual(model.w * 4 + 0.01);
      g.dispose();
    }
});
it('ships individually named Meshopt GLBs with KTX2 atlases, three LOD nodes and matching content hashes', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const manifest = parseAssetManifest(
    JSON.parse(await readFile('public/assets/manifest.json', 'utf8')),
  );
  for (const model of catalogModels()) {
    const entry = manifest.models.find((m) => m.id === model.id)!;
    expect(entry).toBeDefined();
    const bytes = await readFile(`public/assets/${entry.url}`);
    expect(entry.url).toContain(
      createHash('sha256').update(bytes).digest('hex').slice(0, 12),
    );
    const doc = await io.readBinary(bytes),
      root = doc.getRoot();
    expect(
      root
        .listNodes()
        .map((n) => n.getName())
        .sort(),
    ).toEqual(['LOD0', 'LOD1', 'LOD2']);
    expect(root.listExtensionsUsed().map((e) => e.extensionName)).toContain(
      'EXT_meshopt_compression',
    );
    expect(root.listTextures()).toHaveLength(2);
    for (const t of root.listTextures())
      expect(t.getMimeType()).toBe('image/ktx2');
    for (const mat of root.listMaterials()) {
      expect(mat.getRoughnessFactor()).toBeGreaterThanOrEqual(0.7);
      expect(mat.getRoughnessFactor()).toBeLessThanOrEqual(0.95);
      expect(mat.getMetallicFactor()).toBe(0);
    }
    for (const node of root.listNodes()) {
      expect(Array.isArray(node.getExtras().massing)).toBe(true);
      const lod = Number(node.getName().slice(-1));
      const tris = node
        .getMesh()!
        .listPrimitives()
        .reduce(
          (sum, p) =>
            sum +
            (p.getIndices()?.getCount() ??
              p.getAttribute('POSITION')!.getCount()) /
              3,
          0,
        );
      expect(tris).toBeLessThanOrEqual(
        (['RL', 'CL', 'I'].includes(model.zone)
          ? [1500, 300, 12]
          : [4000, 600, 24])[lod]!,
      );
    }
  }
}, 15000);

it('retains the complete office and mall height at the lowest detail', () => {
  for (const model of catalogModels().filter((m) =>
    ['CH', 'O'].includes(m.zone),
  )) {
    const near = catalogGeometry(model, 1),
      far = catalogGeometry(model, 2);
    expect(far.boundingBox!.max.y).toBeCloseTo(near.boundingBox!.max.y, 4);
    near.dispose();
    far.dispose();
  }
});
