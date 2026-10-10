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
import { RoadRenderer } from './roads/roadRenderer';
import { ROAD_TOOL_RENDER as CONFIG } from '../data/roadTool';
import { UI_PALETTE } from '../data/palette';
import {
  curvePoint,
  curveTangent,
  curveLength,
  type Cubic,
} from '../world/roadCurves';
import { meshHeightAt } from '../world/heightField';
import type {
  ConstructionPreview,
  RoadConstructionWorld,
} from '../world/roadConstruction';
import type { Vec2 } from '../world/types';

function ribbon(
  curve: Cubic,
  width: number,
  heights: Float32Array,
  lift: number,
  deck?: [number, number],
): BufferGeometry {
  const length = curveLength(curve),
    steps = Math.max(1, Math.ceil(length / CONFIG.sampleM)),
    across = Math.max(1, Math.ceil(width / CONFIG.sampleM));
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= across; j++) {
      const center = curvePoint(curve, i / steps),
        tangent = curveTangent(curve, i / steps),
        l = Math.hypot(tangent.x, tangent.z),
        ux = tangent.x / l,
        uz = tangent.z / l,
        side = width * (j / across - 0.5);
      const x = center.x - uz * side,
        z = center.z + ux * side;
      positions.push(
        x,
        (deck
          ? deck[0] + ((deck[1] - deck[0]) * i) / steps
          : meshHeightAt(heights, x, z)) + lift,
        z,
      );
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
/** Ground-following tool overlay and batched committed road meshes. */
export class RoadPreviewRenderer {
  readonly group = new Group();
  readonly roads = new RoadRenderer();
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
    this.group.add(this.roads.group, this.ghost, this.marker);
    this.marker.rotation.x = -Math.PI / 2;
    this.ghost.visible = this.marker.visible = false;
    this.group.visible = false;
    scene.add(this.group);
  }
  /** Synchronize only changed road objects, outside the render loop. */
  sync(world: RoadConstructionWorld): void {
    this.world = world;
    this.roads.sync(world);
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
      [p.draft.start, p.draft.c1, p.draft.c2, p.draft.end],
      p.width,
      heights,
      CONFIG.previewLiftM,
      p.draft.elevated ? [p.start.height, p.end.height] : undefined,
    );
    this.ghostMaterial.color.set(
      result.canBuild ? UI_PALETTE.accent : UI_PALETTE.negative,
    );
  }
  /** Release CPU/GPU resources owned by the construction overlay. */
  dispose(): void {
    this.roads.dispose();
    this.ghost.geometry.dispose();
    this.marker.geometry.dispose();
    this.ghostMaterial.dispose();
    this.markerMaterial.dispose();
    this.scene.remove(this.group);
  }
}
