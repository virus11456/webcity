import {
  Group,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  type Scene,
} from 'three';
import { ROAD_MESH } from '../data/roadMesh';
import { TRAM } from '../data/tram';
import { UI_PALETTE } from '../data/palette';
import type { BusLineView } from '../world/transit';
/** Rails follow the same sampled road lanes as the authoritative trams. */
export class TramTracks {
  readonly group = new Group();
  private material = new LineBasicMaterial({ color: UI_PALETTE.text });
  private key = '';
  constructor(scene: Scene) {
    scene.add(this.group);
  }
  update(lines: BusLineView[]) {
    const key = JSON.stringify(lines.map((l) => [l.id, l.blocked, l.tracks]));
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const data: number[] = [];
    const seen = new Set<string>();
    for (const l of lines)
      for (const t of l.tracks ?? []) {
        const key = JSON.stringify([t.segment, t.points[0], t.points.at(-1)]);
        if (seen.has(key)) continue;
        seen.add(key);
        for (let i = 1; i < t.points.length; i++) {
          const a = t.points[i - 1]!,
            b = t.points[i]!,
            d = Math.hypot(b.x - a.x, b.z - a.z);
          if (!d) continue;
          const nx = -(b.z - a.z) / d,
            nz = (b.x - a.x) / d;
          for (const side of [-1, 1])
            for (const p of [a, b])
              data.push(
                p.x + nx * side * TRAM.railOffsetM,
                p.y + ROAD_MESH.surfaceLiftM + TRAM.railLiftM,
                p.z + nz * side * TRAM.railOffsetM,
              );
        }
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(data, 3));
    this.group.add(new LineSegments(g, this.material));
  }
  private clear() {
    for (const c of this.group.children) (c as LineSegments).geometry.dispose();
    this.group.clear();
  }
  dispose() {
    this.clear();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
