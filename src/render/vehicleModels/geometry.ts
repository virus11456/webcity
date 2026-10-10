import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  VEHICLE_MODELS,
  VEHICLE_MODEL_STYLE as S,
} from '../../data/vehicleModels';
import { VEHICLE_APPEARANCE as C } from '../../data/vehicleAppearance';
import {
  VEHICLE_PALETTE as P,
  SERVICE_PALETTE as SP,
} from '../../data/palette';
export type VehicleModel = (typeof VEHICLE_MODELS)[number];
/** Original authored silhouettes; +Z is forward, origin is wheel contact centre. */
export function formalVehicleGeometry(
  model: VehicleModel,
  lod: 0 | 1,
): BufferGeometry {
  const parts: BufferGeometry[] = [],
    color = new Color();
  const add = (
    g: BufferGeometry,
    tint: string | null,
    x: number,
    y: number,
    z: number,
  ) => {
    const p = g.index ? g.toNonIndexed() : g;
    if (p !== g) g.dispose();
    p.deleteAttribute('uv');
    p.translate(x, y, z);
    color.set(tint ?? P.base);
    const count = p.getAttribute('position').count,
      colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++)
      colors.set([color.r, color.g, color.b], i * 3);
    p.setAttribute('color', new Float32BufferAttribute(colors, 3));
    p.setAttribute(
      '_paint',
      new Float32BufferAttribute(new Float32Array(count).fill(tint ? 0 : 1), 1),
    );
    parts.push(p);
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tint: string | null = null,
  ) => add(new BoxGeometry(w, h, d), tint, x, y + h / 2, z);
  const kind = model.kind,
    v = model.variant;
  const [w, h, d] =
    kind === 9
      ? S.metro
      : kind === 2
        ? C.bus
        : [1, 4, 6].includes(kind)
          ? C.truck
          : C.car;
  const isCar = [0, 3, 7].includes(kind),
    tall = kind === 5;
  box(0, 0.32, 0, w, h * 0.4, d);
  const cabinLength = isCar
    ? d * [0.5, 0.65, 0.43, 0.72, 0.58, 0.48][v % 6]!
    : tall
      ? d * 0.85
      : kind === 2 || kind === 9
        ? d * 0.91
        : d * 0.24;
  const cabinZ = isCar
    ? -d * 0.04
    : tall
      ? 0
      : kind === 2 || kind === 9
        ? 0
        : d * 0.33;
  const cabinHeight = isCar
    ? h * [0.38, 0.43, 0.32, 0.45, 0.5, 0.35][v % 6]!
    : h * 0.5;
  const cabin = new BoxGeometry(w * 0.88, cabinHeight, cabinLength);
  if (isCar) {
    const a = cabin.getAttribute('position');
    for (let i = 0; i < a.count; i++)
      if (a.getY(i) > 0)
        a.setXYZ(i, a.getX(i) * 0.9, a.getY(i), a.getZ(i) * 0.72);
    cabin.computeVertexNormals();
  }
  add(cabin, P.glass, 0, 0.32 + h * 0.4 + cabinHeight / 2, cabinZ);
  box(
    0,
    0.32 + h * 0.4 + cabinHeight,
    cabinZ,
    w * (isCar ? 0.81 : 0.91),
    0.09,
    cabinLength * (isCar ? 0.72 : 1),
  );
  if (kind === 1 || kind === 4 || kind === 6) {
    if (kind === 1 && v === 2) {
      const tank = new CylinderGeometry(
        w * 0.46,
        w * 0.46,
        d * 0.6,
        lod ? 6 : 12,
      );
      tank.rotateX(Math.PI / 2);
      add(tank, P.chrome, 0, h * 0.57, -d * 0.16);
    } else
      box(
        0,
        h * 0.4 + 0.32,
        -d * 0.17,
        w * 0.96,
        h * (kind === 1 && v === 1 ? 0.2 : 0.5),
        d * 0.59,
        kind === 6 ? P.paint[5] : null,
      );
  }
  if (kind === 6) box(0, 0.6, -d * 0.42, w * 0.8, 0.5, d * 0.16, P.chrome);
  if (!lod) {
    for (const x of [-w * 0.48, w * 0.48])
      for (const z of [-d * 0.31, d * 0.31]) {
        const wheel = new CylinderGeometry(
          S.wheelRadius,
          S.wheelRadius,
          0.2,
          S.wheelSegments,
        );
        wheel.rotateZ(Math.PI / 2);
        add(wheel, P.rubber, x, S.wheelRadius, z);
      }
    for (const x of [-w * 0.31, w * 0.31]) {
      box(x, 0.55, d * 0.5, 0.28, 0.17, 0.04, P.headlight);
      box(x, 0.55, -d * 0.5, 0.28, 0.17, 0.04, P.taillight);
    }
    if (kind === 3 || kind === 4 || kind === 5)
      box(
        0,
        h * 0.4 + 0.46 + cabinHeight,
        cabinZ,
        w * 0.64,
        0.17,
        0.28,
        kind === 3 ? SP.police : SP.fire,
      );
    if (kind === 4) {
      box(0, h * 0.93, -d * 0.16, 0.55, 0.14, d * 0.58, P.chrome);
      for (const x of [-w * 0.47, w * 0.47])
        box(x, h * 0.55, -d * 0.16, 0.06, 0.22, d * 0.5, P.chrome);
    }
    if (kind === 5)
      for (const x of [-w * 0.505, w * 0.505]) {
        box(x, h * 0.5, -d * 0.13, 0.025, 0.52, 0.16, SP.fire);
        box(x, h * 0.65, -d * 0.13, 0.026, 0.16, 0.56, SP.fire);
      }
    if (kind === 7)
      box(0, h * 0.5, -d * 0.25, w * 0.8, 0.35, d * 0.35, P.glass);
    if (kind === 2 || kind === 9)
      for (let z = -d * 0.34; z < d * 0.4; z += d / 7)
        box(0, h * 0.6, z, w * 0.9, h * 0.32, 0.06);
    if (kind === 0 && v === 2) box(0, h * 0.47, -d * 0.41, w * 0.9, 0.08, 0.3);
    if (kind === 0 && v === 5)
      box(0, h * 0.77, -d * 0.2, w * 0.7, 0.08, d * 0.2, P.glass);
  }
  const result = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
