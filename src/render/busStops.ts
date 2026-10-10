import {
  Group,
  Mesh,
  CylinderGeometry,
  MeshBasicMaterial,
  type Scene,
} from 'three';
import { TRANSIT } from '../data/transit';
import { UI_PALETTE, ZONE_PALETTE } from '../data/palette';
import type { Vec2 } from '../world/types';
import type { BusLineView } from '../world/transit';
/** Visible roadside stop posts; no drawing a straight shortcut through city blocks. */
export class BusStops {
  readonly group = new Group();
  private geometry = new CylinderGeometry(
    TRANSIT.stopRadiusM,
    TRANSIT.stopRadiusM,
    TRANSIT.stopHeightM,
    8,
  );
  private materials = [
    new MeshBasicMaterial({ color: UI_PALETTE.accent }),
    ...Object.values(ZONE_PALETTE).map(
      (p) => new MeshBasicMaterial({ color: p.normal }),
    ),
  ];
  private key = '';
  constructor(
    scene: Scene,
    private height: (x: number, z: number) => number,
  ) {
    scene.add(this.group);
  }
  update(active: boolean, stops: Vec2[], lines: BusLineView[]) {
    this.group.visible = active || lines.length > 0;
    const key = JSON.stringify([
      stops,
      lines.map((l) => [l.id, l.color, l.stops]),
    ]);
    if (key === this.key) return;
    this.key = key;
    this.group.clear();
    const add = (points: Vec2[], color: number) => {
      for (const p of points) {
        const m = new Mesh(this.geometry, this.materials[color]);
        m.position.set(
          p.x,
          this.height(p.x, p.z) + TRANSIT.stopHeightM / 2,
          p.z,
        );
        this.group.add(m);
      }
    };
    for (const l of lines) add(l.stops, l.color + 1);
    add(stops, 0);
  }
  dispose() {
    this.group.removeFromParent();
    this.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
