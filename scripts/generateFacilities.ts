import { resolve } from 'node:path';
import { format } from 'prettier';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  Document,
  NodeIO,
  type Material as GltfMaterial,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { Color, type BufferGeometry } from 'three';
import { facilityModels } from '../src/world/facilityModels';
import {
  facilityGeometry,
  facilityRotor,
} from '../src/render/facilities/geometry';
import { POWER } from '../src/data/power';
import { BUILDING_DETAIL_PALETTE as P } from '../src/data/palette';
import { parseAssetManifest } from '../src/core/assetManifest';
import { modelAtlas } from './modelAtlas';
import { compressAsset } from './compressAsset';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
const group = 'services',
  zones = ['civic'];
const models = facilityModels,
  report: unknown[] = [];
await mkdir('assets-source/catalog', { recursive: true });
await mkdir('public/assets/models', { recursive: true });
const manifest = parseAssetManifest(
  JSON.parse(await readFile('public/assets/manifest.json', 'utf8')),
);
const add = (
  doc: Document,
  g: BufferGeometry,
  name: string,
  material: GltfMaterial,
) => {
  const primitive = doc.createPrimitive().setMaterial(material),
    buffer = doc.getRoot().listBuffers()[0]!;
  for (const [key, semantic, type] of [
    ['position', 'POSITION', 'VEC3'],
    ['normal', 'NORMAL', 'VEC3'],
    ['color', 'COLOR_0', 'VEC3'],
    ['uv', 'TEXCOORD_0', 'VEC2'],
  ] as const) {
    const a = g.getAttribute(key);
    if (a)
      primitive.setAttribute(
        semantic,
        doc
          .createAccessor()
          .setType(type)
          .setArray(new Float32Array(a.array))
          .setBuffer(buffer),
      );
  }
  if (g.index)
    primitive.setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint32Array(g.index.array))
        .setBuffer(buffer),
    );
  const node = doc
    .createNode(name)
    .setMesh(doc.createMesh(name).addPrimitive(primitive))
    .setExtras({ ...g.userData });
  doc.getRoot().listScenes()[0]!.addChild(node);
};
for (const zone of zones) {
  const selected = models;
  if (!selected.length) continue;
  const atlasDoc = new Document();
  atlasDoc.createBuffer();
  atlasDoc.createScene();
  const color = atlasDoc
    .createTexture(`${zone}-color`)
    .setMimeType('image/png')
    .setImage(await modelAtlas('RH', false));
  const emission = atlasDoc
    .createTexture(`${zone}-emission`)
    .setMimeType('image/png')
    .setImage(await modelAtlas('RH', true));
  const mat = atlasDoc
    .createMaterial()
    .setBaseColorTexture(color)
    .setEmissiveTexture(emission)
    .setEmissiveFactor([1, 1, 1]);
  const sample = facilityGeometry(selected[0]!, 0);
  add(atlasDoc, sample, 'atlas', mat);
  sample.dispose();
  const raw = `assets-source/catalog/${zone.toLowerCase()}-atlas.glb`,
    compressed = `/tmp/webcity-${zone.toLowerCase()}-atlas.glb`;
  await io.write(raw, atlasDoc);
  await compressAsset(
    raw,
    compressed,
    resolve('node_modules/@gltf-transform/cli/bin/cli.js'),
  );
  const packed = await io.read(compressed),
    textures = packed.getRoot().listTextures();
  const colorBytes = textures
      .find((t) => t.getName() === `${zone}-color`)!
      .getImage()!,
    emissionBytes = textures
      .find((t) => t.getName() === `${zone}-emission`)!
      .getImage()!;
  for (const model of selected) {
    const doc = new Document();
    doc.createBuffer();
    doc.createScene(model.id);
    doc.createExtension(KHRTextureBasisu).setRequired(true);
    const c = doc
        .createTexture(`${zone}-color`)
        .setMimeType('image/ktx2')
        .setImage(colorBytes),
      e = doc
        .createTexture(`${zone}-emission`)
        .setMimeType('image/ktx2')
        .setImage(emissionBytes),
      light = new Color(P.windowLight);
    const material = doc
      .createMaterial(`${zone}-atlas`)
      .setBaseColorTexture(c)
      .setEmissiveTexture(e)
      .setEmissiveFactor([light.r, light.g, light.b])
      .setRoughnessFactor(0.85)
      .setMetallicFactor(0);
    const triangles: number[] = [];
    for (const lod of [0, 1, 2] as const) {
      const g = facilityGeometry(model, lod);
      triangles.push((g.index?.count ?? g.getAttribute('position').count) / 3);
      add(doc, g, `LOD${lod}`, material);
      g.dispose();
      if (model.defId === 'power_wind' && lod < 2) {
        const rotor = facilityRotor(lod as 0 | 1);
        triangles[lod]! += rotor.getAttribute('position').count / 3;
        add(doc, rotor, `RotorMesh${lod}`, material);
        const scene = doc.getRoot().listScenes()[0]!,
          child = scene.listChildren().at(-1)!;
        scene.removeChild(child);
        scene.addChild(
          doc
            .createNode(`Rotor${lod}`)
            .setTranslation([0, POWER.rotorHeightM, -model.d * 4 + 3])
            .addChild(child),
        );
        rotor.dispose();
      }
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
    report.push({ ...model, triangles, bytes: bytes.length, url });
  }
}
manifest.models.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(
  'public/assets/manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
await writeFile(
  `assets-source/catalog/${group}-recipes.json`,
  await format(JSON.stringify(report), { parser: 'json' }),
);
console.log(
  `Generated ${models.length} original ${group} models with 3 LODs each.`,
);
