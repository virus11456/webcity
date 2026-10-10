import {
  Float32BufferAttribute,
  Mesh,
  type BufferGeometry,
  type Object3D,
} from 'three';
/** Bake glTF quantization transforms into instance-local metre coordinates. */
export function vehicleLods(root: Object3D): BufferGeometry[] {
  root.updateMatrixWorld(true);
  return [0, 1].map((lod) => {
    const node = root.getObjectByName(`LOD${lod}`);
    if (!(node instanceof Mesh)) throw new Error('Missing vehicle LOD');
    const g = node.geometry.clone();
    for (const key of ['position', 'normal']) {
      const a = g.getAttribute(key),
        values = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++)
        values.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
      g.setAttribute(key, new Float32BufferAttribute(values, 3));
    }
    if (!g.getAttribute('_paint'))
      throw new Error('Missing vehicle paint mask');
    g.applyMatrix4(node.matrixWorld);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  });
}
