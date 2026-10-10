import { mkdir } from 'node:fs/promises';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Color,
} from 'three';
import sharp from 'sharp';
import {
  BUILDING_PALETTE as P,
  BUILDING_DETAIL_PALETTE as D,
  ENVIRONMENT_PALETTE as E,
} from '../src/data/palette.ts';

// Original sample: a metre-scale home, front-centre origin, road-facing +Z.
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('WebCity original sample');
const texture = doc
  .createTexture('sample facade')
  .setMimeType('image/png')
  .setImage(
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${P.RL.walls[0]}"/><path d="M0 64H256M0 128H256M0 192H256" stroke="${P.RL.walls[3]}" stroke-width="2"/><rect x="36" y="68" width="68" height="104" fill="${D.frame}"/><rect x="42" y="74" width="56" height="92" fill="${D.glass}"/><rect x="152" y="68" width="68" height="104" fill="${D.frame}"/><rect x="158" y="74" width="56" height="92" fill="${D.glass}"/><path d="M70 74V166M186 74V166M42 120H98M158 120H214" stroke="${D.frame}" stroke-width="4"/></svg>`,
      ),
    )
      .png()
      .toBuffer(),
  );
const material = (name: string, hex: string) => {
  const c = new Color(hex);
  return doc
    .createMaterial(name)
    .setBaseColorFactor([c.r, c.g, c.b, 1])
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0);
};
const wall = material('facade', D.atlasWhite).setBaseColorTexture(texture);
const roof = material('terracotta', P.RL.roofs[1]);
const lawn = material('garden', E.grass);
const path = material('path', D.concrete);
const door = material('door', P.RL.accents[1]);
function add(
  name: string,
  geometry: BufferGeometry,
  mat: ReturnType<typeof material>,
) {
  const primitive = doc.createPrimitive().setMaterial(mat);
  for (const [attribute, semantic, type] of [
    ['position', 'POSITION', 'VEC3'],
    ['normal', 'NORMAL', 'VEC3'],
    ['uv', 'TEXCOORD_0', 'VEC2'],
  ] as const) {
    const source = geometry.getAttribute(attribute);
    if (source)
      primitive.setAttribute(
        semantic,
        doc
          .createAccessor()
          .setType(type)
          .setArray(new Float32Array(source.array))
          .setBuffer(buffer),
      );
  }
  if (geometry.index)
    primitive.setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array(geometry.index.array))
        .setBuffer(buffer),
    );
  scene.addChild(
    doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)),
  );
  geometry.dispose();
}
add('garden', new BoxGeometry(16, 0.1, 16).translate(0, 0.05, -8), lawn);
add('path', new BoxGeometry(2, 0.12, 4).translate(0, 0.06, -2), path);
add('house', new BoxGeometry(10, 6, 9).translate(0, 3.1, -8.5), wall);
add(
  'front-door',
  new BoxGeometry(1.5, 2.5, 0.12).translate(0, 1.35, -3.96),
  door,
);
const g = new BufferGeometry();
g.setAttribute(
  'position',
  new Float32BufferAttribute(
    [
      -5.4, 6.1, -3.6, 5.4, 6.1, -3.6, 0, 9, -3.6, 5.4, 6.1, -13.4, -5.4, 6.1,
      -13.4, 0, 9, -13.4, -5.4, 6.1, -13.4, -5.4, 6.1, -3.6, 0, 9, -3.6, -5.4,
      6.1, -13.4, 0, 9, -3.6, 0, 9, -13.4, 5.4, 6.1, -3.6, 5.4, 6.1, -13.4, 0,
      9, -13.4, 5.4, 6.1, -3.6, 0, 9, -13.4, 0, 9, -3.6,
    ],
    3,
  ),
);
g.computeVertexNormals();
add('gable-roof', g, roof);
await mkdir('assets-source', { recursive: true });
await new NodeIO().write('assets-source/bld_rl_l2_2x2_sample.glb', doc);
console.log('Generated original sample GLB');
