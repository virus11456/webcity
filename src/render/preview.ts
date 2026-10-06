import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  DoubleSide,
  type Scene,
} from 'three';
import { ROAD_TOOL_RENDER as CONFIG } from '../data/roadTool';
import { ROAD_PALETTE, UI_PALETTE } from '../data/palette';
import { ROADS } from '../data/roads';
import { distance, lerp } from '../core/math';
import { meshHeightAt } from '../world/heightField';
import type {
  ConstructionPreview,
  RoadConstructionWorld,
} from '../world/roadConstruction';
import type { Vec2 } from '../world/types';

function ribbon(
  start: Vec2,
  end: Vec2,
  width: number,
  heights: Float32Array,
  lift: number,
): BufferGeometry {
  const length = distance(start, end),
    steps = Math.max(1, Math.ceil(length / CONFIG.sampleM)),
    across = Math.max(1, Math.ceil(width / CONFIG.sampleM));
  const ux = length ? (end.x - start.x) / length : 0,
    uz = length ? (end.z - start.z) / length : 0;
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= across; j++) {
      const center = lerp(start, end, i / steps),
        side = width * (j / across - 0.5);
      const x = center.x - uz * side,
        z = center.z + ux * side;
      positions.push(x, meshHeightAt(heights, x, z) + lift, z);
      if (i < steps && j < across) {
        const a = i * (across + 1) + j,
          b = a + across + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
/** Ground-following preview and committed-road ribbons, replaced by detailed road meshes in M1-06. */
export class RoadPreviewRenderer {
  readonly group = new Group();
  private readonly roads = new Map<number, Mesh>();
  private readonly asphalt = new MeshBasicMaterial({
    color: ROAD_PALETTE.asphalt,
    side: DoubleSide,
  });
  private readonly ghostMaterial = new MeshBasicMaterial({
    color: UI_PALETTE.accent,
    transparent: true,
    opacity: CONFIG.previewOpacity,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly ghost = new Mesh(new BufferGeometry(), this.ghostMaterial);
  private readonly markerMaterial = new MeshBasicMaterial({
    color: UI_PALETTE.accent,
    side: DoubleSide,
    depthTest: false,
  });
  private readonly marker = new Mesh(
    new RingGeometry(CONFIG.markerRadiusM * 0.7, CONFIG.markerRadiusM, 24),
    this.markerMaterial,
  );
  private world: RoadConstructionWorld | undefined;
  constructor(private readonly scene: Scene) {
    this.group.add(this.ghost, this.marker);
    this.marker.rotation.x = -Math.PI / 2;
    this.ghost.visible = this.marker.visible = false;
    this.group.visible = false;
    scene.add(this.group);
  }
  /** Synchronize only changed road objects, outside the render loop. */
  sync(world: RoadConstructionWorld): void {
    this.world = world;
    const ids = new Set(world.segments.map((segment) => segment.id));
    for (const [id, mesh] of this.roads)
      if (!ids.has(id)) {
        mesh.geometry.dispose();
        this.group.remove(mesh);
        this.roads.delete(id);
      }
    const nodes = new Map(world.nodes.map((node) => [node.id, node]));
    for (const segment of world.segments)
      if (!this.roads.has(segment.id)) {
        const mesh = new Mesh(
          ribbon(
            nodes.get(segment.start)!.pos,
            nodes.get(segment.end)!.pos,
            ROADS[segment.type].widthM,
            world.heights,
            CONFIG.surfaceLiftM,
          ),
          this.asphalt,
        );
        this.roads.set(segment.id, mesh);
        this.group.add(mesh);
      }
  }
  /** Show one tentative road and its origin; invalid geometry is red. */
  show(result: ConstructionPreview | null, anchor: Vec2 | null): void {
    const heights = this.world?.heights;
    this.ghost.visible = Boolean(result?.preview && heights);
    this.marker.visible = Boolean(anchor && heights);
    if (anchor && heights)
      this.marker.position.set(
        anchor.x,
        meshHeightAt(heights, anchor.x, anchor.z) + CONFIG.previewLiftM,
        anchor.z,
      );
    if (!result?.preview || !heights) return;
    const p = result.preview;
    this.ghost.geometry.dispose();
    this.ghost.geometry = ribbon(
      p.draft.start,
      p.draft.end,
      distance(p.footprint[0]!, p.footprint[3]!),
      heights,
      CONFIG.previewLiftM,
    );
    this.ghostMaterial.color.set(
      result.canBuild ? UI_PALETTE.accent : UI_PALETTE.negative,
    );
  }
  /** Release CPU/GPU resources owned by the construction overlay. */
  dispose(): void {
    for (const mesh of this.roads.values()) mesh.geometry.dispose();
    this.ghost.geometry.dispose();
    this.marker.geometry.dispose();
    this.asphalt.dispose();
    this.ghostMaterial.dispose();
    this.markerMaterial.dispose();
    this.scene.remove(this.group);
  }
}
