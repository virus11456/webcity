import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { VEHICLE_MODELS } from '../../src/data/vehicleModels';
import { VEHICLE_APPEARANCE } from '../../src/data/vehicleAppearance';
import { VEHICLE_PALETTE } from '../../src/data/palette';
import { formalVehicleGeometry } from '../../src/render/vehicleModels/geometry';
import { vehicleModelIndex } from '../../src/world/vehicleModels';
import { vehicleColor } from '../../src/render/vehicles';
import { parseAssetManifest } from '../../src/core/assetManifest';
it('provides sixteen distinct original shapes within 600/100 triangles and keeps body paint separate from trim', () => {
  const hashes = new Set();
  for (const m of VEHICLE_MODELS)
    for (const lod of [0, 1] as const) {
      const g = formalVehicleGeometry(m, lod);
      expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(
        lod ? 100 : 600,
      );
      expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(new Set(g.getAttribute('_paint').array)).toEqual(new Set([0, 1]));
      if (!lod)
        hashes.add(
          createHash('sha256')
            .update(Buffer.from(g.getAttribute('position').array.buffer))
            .digest('hex'),
        );
      g.dispose();
    }
  expect(hashes.size).toBe(16);
});
it('selects stable variants across all citizens and follows the specified paint distribution', () => {
  const cars = new Set(),
    trucks = new Set(),
    colors = new Map<string, number>();
  for (let i = 1; i <= 10000; i++) {
    cars.add(vehicleModelIndex(i, 0));
    trucks.add(vehicleModelIndex(i, 1));
    const color = vehicleColor(i, 0);
    colors.set(color, (colors.get(color) ?? 0) + 1);
  }
  expect(cars.size).toBe(6);
  expect(trucks.size).toBe(3);
  for (let i = 0; i < 9; i++)
    expect(
      Math.abs(
        colors.get(VEHICLE_PALETTE.paint[i]!)! / 100 -
          VEHICLE_APPEARANCE.weights[i]!,
      ),
    ).toBeLessThan(0.1);
  for (let kind = 2; kind < 8; kind++)
    expect(VEHICLE_MODELS[vehicleModelIndex(100, kind)]!.kind).toBe(kind);
  expect(vehicleModelIndex(100, 8)).toBe(16);
});
it('decodes every shipped Meshopt model with both LODs and paint mask', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const manifest = parseAssetManifest(
    JSON.parse(await readFile('public/assets/manifest.json', 'utf8')),
  );
  for (const m of VEHICLE_MODELS) {
    const entry = manifest.models.find((e) => e.id === m.id)!;
    expect(entry).toBeDefined();
    const bytes = await readFile(`public/assets/${entry.url}`);
    expect(entry.url).toContain(
      createHash('sha256').update(bytes).digest('hex').slice(0, 12),
    );
    const root = (await io.readBinary(bytes)).getRoot();
    expect(root.listExtensionsUsed().map((e) => e.extensionName)).toContain(
      'EXT_meshopt_compression',
    );
    for (const lod of [0, 1]) {
      const p = root
        .listNodes()
        .find((n) => n.getName() === `LOD${lod}`)!
        .getMesh()!
        .listPrimitives()[0]!;
      expect(p.getAttribute('_PAINT')).toBeTruthy();
      expect(p.getIndices()!.getCount() / 3).toBeLessThanOrEqual(
        lod ? 100 : 600,
      );
    }
  }
});
