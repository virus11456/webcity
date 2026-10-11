import {
  Group,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  type Scene,
} from 'three';
import { UI_PALETTE, ZONE_PALETTE } from '../data/palette';
import { METRO } from '../data/metro';
import { metroRoute } from '../world/metro';
import type { Vec2 } from '../world/types';
import type { BusLineView } from '../world/transit';
/** X-ray tunnel view reuses the terrain's underground transparency. */
export class MetroTracks {
  readonly group = new Group();
  private key = '';
  private materials = [
    new LineBasicMaterial({ color: UI_PALETTE.accent, depthTest: false }),
    ...Object.values(ZONE_PALETTE).map(
      (p) => new LineBasicMaterial({ color: p.normal, depthTest: false }),
    ),
  ];
  constructor(
    scene: Scene,
    private height: (x: number, z: number) => number,
  ) {
    scene.add(this.group);
  }
  update(active: boolean, draft: Vec2[], lines: BusLineView[]) {
    this.group.visible = active;
    const key = JSON.stringify([
      draft,
      lines.map((l) => [l.id, l.color, l.stops]),
    ]);
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const add = (stops: Vec2[], color: number, closed: boolean) => {
      const positions: number[] = [];
      for (let i = 0; i < (closed ? stops.length : stops.length - 1); i++) {
        const a = stops[i]!,
          b = stops[(i + 1) % stops.length]!,
          route = metroRoute(a, b, this.height, 0, 'preview'),
          points = route.legs[0]!.points;
        const nx = -(b.z - a.z) / route.length,
          nz = (b.x - a.x) / route.length;
        for (let j = 1; j < points.length; j++)
          for (const side of [-1, 1])
            for (const p of [points[j - 1]!, points[j]!])
              positions.push(
                p.x + nx * side * METRO.railOffsetM,
                p.y,
                p.z + nz * side * METRO.railOffsetM,
              );
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      const mesh = new LineSegments(geometry, this.materials[color]);
      mesh.renderOrder = 120;
      this.group.add(mesh);
    };
    for (const l of lines) add(l.stops, l.color + 1, true);
    add(draft, 0, false);
  }
  private clear() {
    for (const child of this.group.children)
      (child as LineSegments).geometry.dispose();
    this.group.clear();
  }
  dispose() {
    this.clear();
    for (const m of this.materials) m.dispose();
    this.group.removeFromParent();
  }
}
