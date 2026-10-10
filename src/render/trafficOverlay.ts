import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Color,
  type Scene,
} from 'three';
import { Surface } from './roads/geometry';
import { sampleRoad } from '../world/roadProfile';
import {
  savedRoadTraffic,
  roadTrafficBand,
  type RoadTraffic,
} from '../world/roadTraffic';
import { UI_PALETTE } from '../data/palette';
import { INFO } from '../data/infoViews';
import { ROADS } from '../data/roads';
import type { RoadNode, RoadSegment } from '../world/types';
import type { SimEvent } from '../bridge/protocol';
export function trafficColor(ratio: number): string {
  const band = roadTrafficBand(ratio);
  return band === 'good'
    ? UI_PALETTE.infoScale[0]
    : band === 'slow'
      ? UI_PALETTE.infoScale[2]
      : UI_PALETTE.infoScale[4];
}
/** Single draw call at actual road-deck elevation; only color ranges change on traffic samples. */
export class TrafficOverlay {
  readonly mesh = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({ vertexColors: true, depthWrite: false }),
  );
  private roads = new Map<number, RoadSegment>();
  private nodes = new Map<number, RoadNode>();
  private flows = new Map<number, RoadTraffic>();
  private ranges = new Map<number, [number, number]>();
  private dirty = false;
  private colorsDirty = false;
  private readonly color = new Color();
  constructor(private scene: Scene) {
    this.mesh.visible = false;
    this.mesh.material.userData.infoRole = 'preserve';
    scene.add(this.mesh);
  }
  set(active: boolean) {
    this.mesh.visible = active;
  }
  accept(e: SimEvent) {
    if (e.t === 'ready') {
      this.roads = new Map(e.snapshot.segments.map((s) => [s.id, s]));
      this.nodes = new Map(e.snapshot.nodes.map((n) => [n.id, n]));
      this.flows = new Map(
        savedRoadTraffic(e.snapshot.segments, e.snapshot.traffic).map((v) => [
          v.id,
          v,
        ]),
      );
      this.dirty = true;
    } else if (e.t === 'roadsChanged') {
      for (const id of e.removed) {
        this.roads.delete(id);
        this.flows.delete(id);
      }
      for (const s of e.added) this.roads.set(s.id, s);
      for (const id of e.removedNodes) this.nodes.delete(id);
      for (const n of e.nodes) this.nodes.set(n.id, n);
      this.dirty = true;
    } else if (e.t === 'roadTraffic') {
      this.flows = new Map(e.roads.map((v) => [v.id, v]));
      this.colorsDirty = true;
    }
  }
  update() {
    if (!this.mesh.visible) return;
    if (this.dirty) {
      this.dirty = false;
      this.ranges.clear();
      const surface = new Surface();
      for (const s of this.roads.values()) {
        const a = this.nodes.get(s.start),
          b = this.nodes.get(s.end);
        if (!a || !b) continue;
        const pts = sampleRoad(s, a, b),
          width = (ROADS[s.type].widthM * INFO.trafficWidthFraction) / 2,
          start = surface.data.positions.length / 3;
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i - 1]!,
            q = pts[i]!,
            len = Math.hypot(q.x - p.x, q.z - p.z);
          if (!len) continue;
          const dx = (-(q.z - p.z) / len) * width,
            dz = ((q.x - p.x) / len) * width;
          surface.quad(
            { x: p.x + dx, y: p.y + INFO.trafficHeightM, z: p.z + dz },
            { x: q.x + dx, y: q.y + INFO.trafficHeightM, z: q.z + dz },
            { x: q.x - dx, y: q.y + INFO.trafficHeightM, z: q.z - dz },
            { x: p.x - dx, y: p.y + INFO.trafficHeightM, z: p.z - dz },
            trafficColor(1),
          );
        }
        this.ranges.set(s.id, [start, surface.data.positions.length / 3]);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(surface.data.positions, 3),
      );
      geometry.setAttribute(
        'color',
        new Float32BufferAttribute(surface.data.colors, 3),
      );
      geometry.computeBoundingSphere();
      this.mesh.geometry.dispose();
      this.mesh.geometry = geometry;
      this.colorsDirty = true;
    }
    if (this.colorsDirty) {
      this.colorsDirty = false;
      const colors = this.mesh.geometry.getAttribute('color');
      if (!colors) return;
      for (const [id, [start, end]] of this.ranges) {
        this.color.set(trafficColor(this.flows.get(id)?.ratio ?? 1));
        for (let i = start; i < end; i++)
          colors.setXYZ(i, this.color.r, this.color.g, this.color.b);
      }
      colors.needsUpdate = true;
    }
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
