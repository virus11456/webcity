import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ROAD_PALETTE as P,
  ENVIRONMENT_PALETTE as E,
} from '../../data/palette';
import { VEGETATION as V } from '../../data/vegetation';
const leaves = [
  P.tree_leaf,
  E.grass_dark,
  P.median_grass,
  P.tree_leaf,
  E.grass_dark,
  P.median_grass,
  E.grass_dark,
  P.tree_leaf,
];
export function vegetationGeometry(
  species: number,
  lod: number,
): BufferGeometry {
  const height = V.sizes[species]!,
    parts: BufferGeometry[] = [];
  const add = (
    geometry: BufferGeometry,
    x: number,
    y: number,
    z: number,
    hex: string,
  ) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.translate(x, y, z);
    g.deleteAttribute('uv');
    const color = new Color(hex),
      a = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < a.length; i += 3) {
      a[i] = color.r;
      a[i + 1] = color.g;
      a[i + 2] = color.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(a, 3));
    parts.push(g);
  };
  if (lod === 2) {
    const g = new PlaneGeometry(height * 0.8, height);
    g.translate(0, height / 2, 0);
    return g;
  }
  if (species < 6)
    add(
      new CylinderGeometry(
        height * 0.018,
        height * 0.028,
        height * 0.6,
        lod === 0 ? 6 : 3,
      ),
      0,
      height * 0.3,
      0,
      P.tree_trunk,
    );
  if (species === 3 || species === 4) {
    add(
      new ConeGeometry(height * 0.24, height * 0.75, lod === 0 ? 8 : 5),
      0,
      height * 0.6,
      0,
      leaves[species]!,
    );
    if (lod === 0)
      add(
        new ConeGeometry(height * 0.29, height * 0.55, 8),
        0,
        height * 0.43,
        0,
        leaves[species]!,
      );
  } else if (species === 5) {
    const count = lod === 0 ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const g = new BoxGeometry(height * 0.3, height * 0.02, height * 0.075);
      g.translate(height * 0.12, 0, 0);
      g.rotateZ(-0.18);
      g.rotateY((i / count) * Math.PI * 2);
      add(g, 0, height * 0.8, 0, leaves[species]!);
    }
  } else {
    const r = height * (species >= 6 ? 0.5 : 0.32);
    add(
      new IcosahedronGeometry(r, lod === 0 ? 1 : 0),
      0,
      species >= 6 ? height * 0.48 : height * 0.65,
      0,
      leaves[species]!,
    );
    if (lod === 0 && species < 3)
      for (const sign of [-1, 1])
        add(
          new IcosahedronGeometry(r * 0.7, 0),
          sign * r * 0.55,
          height * 0.58,
          sign * r * 0.24,
          leaves[species]!,
        );
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  geometry.computeBoundingSphere();
  return geometry;
}
