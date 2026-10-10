import {
  CylinderGeometry,
  IcosahedronGeometry,
  Float32BufferAttribute,
  Color,
  InstancedMesh,
  MeshStandardMaterial,
  Matrix4,
  BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_MESH as C } from '../../data/roadMesh';
import { ROAD_PALETTE as P } from '../../data/palette';
import { edge, type Arm } from './geometry';
function color(g: BufferGeometry, hex: string): void {
  const c = new Color(hex),
    data = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = c.r;
    data[i + 1] = c.g;
    data[i + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(data, 3));
  g.deleteAttribute('uv');
}
export function roadTrees(arms: Map<number, Arm[]>): InstancedMesh | null {
  const positions: { x: number; y: number; z: number }[] = [];
  for (const [nodeId, list] of arms)
    for (const a of list) {
      const s = a.segment;
      if (s.start !== nodeId) continue;
      if (s.type !== 'road_small_trees' && s.type !== 'road_large') continue;
      const b = arms.get(s.end)!.find((a) => a.segment.id === s.id)!,
        to = a.samples[a.samples.length - 1]!.distance - b.trim;
      const offsets =
        s.type === 'road_large'
          ? [0]
          : [-a.width + C.sidewalkM / 2, a.width - C.sidewalkM / 2];
      for (let d = a.trim + C.treeSpacingM / 2; d < to; d += C.treeSpacingM)
        for (const offset of offsets)
          positions.push(edge(a.samples, d, offset, C.curbHeightM));
    }
  if (!positions.length) return null;
  const trunk = new CylinderGeometry(
    C.treeTrunkRadiusM,
    C.treeTrunkRadiusM,
    C.treeHeightM - C.treeCrownRadiusM,
    5,
  ).toNonIndexed();
  trunk.translate(0, (C.treeHeightM - C.treeCrownRadiusM) / 2, 0);
  color(trunk, P.tree_trunk);
  const crown = new IcosahedronGeometry(C.treeCrownRadiusM, 0);
  crown.translate(0, C.treeHeightM - C.treeCrownRadiusM, 0);
  color(crown, P.tree_leaf);
  const geometry = mergeGeometries([trunk, crown]);
  trunk.dispose();
  crown.dispose();
  const mesh = new InstancedMesh(
      geometry,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      positions.length,
    ),
    matrix = new Matrix4();
  positions.forEach((p, i) => {
    matrix.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}
