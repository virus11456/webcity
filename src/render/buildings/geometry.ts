import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { BUILDING_FORM as F } from '../../data/buildingAppearance';
import type { ZoneType } from '../../data/zones';
import { BUILDING_ZONES } from '../../data/buildingAppearance';

type Point = readonly [number, number, number];
type UV = readonly [number, number];
/** Tile coordinates include a gutter so filtered walls cannot sample a neighboring style. */
export function atlasUV(zone?: ZoneType, variant = 0): [UV, UV, UV, UV] {
  const row = zone ? BUILDING_ZONES.indexOf(zone) + 1 : 0;
  const column = zone ? variant : 0;
  const inset = 2 / F.atlasSize;
  const u = column / F.atlasCells,
    v = 1 - (row + 1) / F.atlasCells;
  const size = 1 / F.atlasCells;
  return [
    [u + inset, v + inset],
    [u + size - inset, v + inset],
    [u + size - inset, v + size - inset],
    [u + inset, v + size - inset],
  ];
}
/** Small non-indexed builder: flat normals and a single vertex-color/atlas material. */
export class BuildingGeometry {
  constructor(private readonly enabled = true) {}
  private positions: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private color = new Color();
  triangle(
    a: Point,
    b: Point,
    c: Point,
    hex: string,
    uv: readonly UV[] = atlasUV(),
  ): void {
    if (!this.enabled) return;
    this.color.set(hex);
    for (const [i, p] of [a, b, c].entries()) {
      this.positions.push(...p);
      this.colors.push(this.color.r, this.color.g, this.color.b);
      this.uvs.push(...uv[i]!);
    }
  }
  quad(
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    hex: string,
    uv = atlasUV(),
  ): void {
    if (!this.enabled) return;
    this.triangle(a, b, c, hex, [uv[0], uv[1], uv[2]]);
    this.triangle(a, c, d, hex, [uv[0], uv[2], uv[3]]);
  }
  /** Coordinates are center X/Z and bottom Y; each floor gets exactly one atlas row. */
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    wall: string,
    roof = wall,
    floors = 1,
    zone?: ZoneType,
    variant = 0,
  ): void {
    if (!this.enabled) return;
    const l = x - w / 2,
      r = x + w / 2,
      f = z + d / 2,
      b = z - d / 2;
    for (let i = 0; i < floors; i++) {
      const lo = y + (h * i) / floors,
        hi = y + (h * (i + 1)) / floors,
        uv = atlasUV(zone, variant);
      this.quad([l, lo, f], [r, lo, f], [r, hi, f], [l, hi, f], wall, uv);
      this.quad([r, lo, b], [l, lo, b], [l, hi, b], [r, hi, b], wall, uv);
      this.quad([r, lo, f], [r, lo, b], [r, hi, b], [r, hi, f], wall, uv);
      this.quad([l, lo, b], [l, lo, f], [l, hi, f], [l, hi, b], wall, uv);
    }
    this.quad([l, y + h, f], [r, y + h, f], [r, y + h, b], [l, y + h, b], roof);
    this.quad([l, y, b], [r, y, b], [r, y, f], [l, y, f], wall);
  }
  roof(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    rise: number,
    color: string,
    hip: boolean,
  ): void {
    if (!this.enabled) return;
    const l = x - w / 2,
      r = x + w / 2,
      f = z + d / 2,
      b = z - d / 2,
      inset = hip ? Math.min(w, d) * 0.3 : 0;
    const front: Point = [x, y + rise, f - inset],
      back: Point = [x, y + rise, b + inset];
    this.quad([l, y, f], front, back, [l, y, b], color);
    this.quad(front, [r, y, f], [r, y, b], back, color);
    this.triangle([l, y, f], [r, y, f], front, color);
    this.triangle([r, y, b], [l, y, b], back, color);
  }
  cylinder(
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    color: string,
    top = color,
  ): void {
    if (!this.enabled) return;
    const n = F.cylinderSides;
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n,
        b = ((i + 1) * 2 * Math.PI) / n;
      const p: Point = [x + Math.cos(a) * r, y, z + Math.sin(a) * r],
        q: Point = [x + Math.cos(b) * r, y, z + Math.sin(b) * r];
      const p2: Point = [p[0], y + h, p[2]],
        q2: Point = [q[0], y + h, q[2]];
      this.quad(q, p, p2, q2, color);
      this.triangle([x, y + h, z], q2, p2, top);
    }
  }
  finish(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
