import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { VEHICLE_MODELS } from '../src/data/vehicleModels';
import { formalVehicleGeometry } from '../src/render/vehicleModels/geometry';
import {
  parseAssetManifest,
  type AssetManifest,
} from '../src/core/assetManifest';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
const manifest = JSON.parse(
    await readFile('public/assets/manifest.json', 'utf8'),
  ) as AssetManifest,
  report = [];
parseAssetManifest(manifest);
for (const model of VEHICLE_MODELS) {
  const doc = new Document(),
    buffer = doc.createBuffer(),
    scene = doc.createScene(model.id),
    mat = doc
      .createMaterial('vehicle-paint')
      .setRoughnessFactor(0.78)
      .setMetallicFactor(0),
    triangles = [];
  for (const lod of [0, 1] as const) {
    const g = formalVehicleGeometry(model, lod),
      p = doc.createPrimitive().setMaterial(mat);
    for (const [key, semantic, type] of [
      ['position', 'POSITION', 'VEC3'],
      ['normal', 'NORMAL', 'VEC3'],
      ['color', 'COLOR_0', 'VEC3'],
      ['_paint', '_PAINT', 'SCALAR'],
    ] as const) {
      p.setAttribute(
        semantic,
        doc
          .createAccessor()
          .setType(type)
          .setArray(new Float32Array(g.getAttribute(key).array))
          .setBuffer(buffer),
      );
    }
    scene.addChild(
      doc.createNode(`LOD${lod}`).setMesh(doc.createMesh().addPrimitive(p)),
    );
    triangles.push(g.getAttribute('position').count / 3);
    g.dispose();
  }
  await doc.transform(
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const bytes = await io.writeBinary(doc),
    hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12),
    url = `models/${model.id}.${hash}.glb`;
  await writeFile(`public/assets/${url}`, bytes);
  manifest.models = manifest.models.filter((m) => m.id !== model.id);
  manifest.models.push({
    id: model.id,
    url,
    author: 'WebCity',
    license: 'Original project asset',
  });
  report.push({ ...model, triangles, url, bytes: bytes.length });
}
manifest.models.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(
  'public/assets/manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
await writeFile(
  'assets-source/catalog/vehicles-recipes.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(`Generated ${report.length} vehicles`);
