import {
  Color,
  DataTexture,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
} from 'three';
import { CELL_SIZE, MAP_SIZE, WORLD } from '../data/config';
import { UI_PALETTE, ZONE_OPACITY, ZONE_PALETTE } from '../data/palette';
import { ZONE_TOOL } from '../data/zoneTool';
import { ZONE_CODES } from '../data/zones';
import type { ZoneBlock, ZoneType } from '../world/types';
import { zoneCellCenter } from '../world/zoneGrid';
import { zoneCellOwned, type ZoneCell } from '../world/zoning';

const vertexShader = `
  uniform sampler2D heights;
  uniform float mapSize, spacing, vertices, lift;
  attribute float zoneCode;
  attribute float selected;
  varying vec2 cellUV;
  varying float code, selection;
  float heightAt(vec2 p) {
    vec2 g = clamp((p + mapSize * 0.5) / spacing, 0.0, vertices - 1.0);
    vec2 i = min(floor(g), vec2(vertices - 2.0)), f = g - i;
    float a = texture2D(heights, (i + vec2(0.5,0.5)) / vertices).r;
    float b = texture2D(heights, (i + vec2(1.5,0.5)) / vertices).r;
    float c = texture2D(heights, (i + vec2(0.5,1.5)) / vertices).r;
    float d = texture2D(heights, (i + vec2(1.5,1.5)) / vertices).r;
    return f.x + f.y <= 1.0 ? a+(b-a)*f.x+(c-a)*f.y : d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);
  }
  void main() {
    vec4 world = instanceMatrix * vec4(position, 1.0);
    world.y = heightAt(world.xz) + lift;
    cellUV = uv; code = zoneCode; selection = selected;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * world;
  }
`;
const fragmentShader = `
  uniform vec3 colors[7];
  uniform float opacity, selectedOpacity, outline, previewCode, showGrid;
  varying vec2 cellUV;
  varying float code, selection;
  void main() {
    bool isSelected = selection > 0.5;
    int id = int(isSelected ? previewCode : code);
    float edge = min(min(cellUV.x, cellUV.y), min(1.0-cellUV.x, 1.0-cellUV.y));
    float lineWidth = max(outline, fwidth(edge));
    float lineAlpha = 1.0 - smoothstep(0.0, lineWidth, edge);
    if (id == 0 && !isSelected && (showGrid < 0.5 || lineAlpha <= 0.0)) discard;
    vec3 color = colors[id];
    if (edge < outline) color = mix(color, colors[0], 0.5);
    gl_FragColor = vec4(color, (isSelected ? selectedOpacity : opacity) * (id == 0 && !isSelected ? lineAlpha : 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
interface Batch {
  mesh: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  refs: string[];
}
/** Instanced, terrain-following cells. Large world changes build a bounded batch per frame. */
export class ZoneRenderer {
  readonly group = new Group();
  private readonly heightData = new Float32Array(WORLD.heightmapVertices ** 2);
  private readonly texture = new DataTexture(
    this.heightData,
    WORLD.heightmapVertices,
    WORLD.heightmapVertices,
    RedFormat,
    FloatType,
  );
  private readonly material: ShaderMaterial;
  private batches: Batch[] = [];
  private staging: Batch[] = [];
  private build: Generator<Batch> | null = null;
  private selected = new Set<string>();
  constructor(parent: Group | import('three').Scene) {
    this.texture.minFilter = this.texture.magFilter = NearestFilter;
    this.texture.needsUpdate = true;
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        heights: { value: this.texture },
        mapSize: { value: MAP_SIZE },
        spacing: { value: WORLD.heightmapSpacingM },
        vertices: { value: WORLD.heightmapVertices },
        lift: { value: ZONE_TOOL.surfaceLiftM },
        colors: {
          value: [
            new Color(UI_PALETTE.text),
            ...Object.values(ZONE_PALETTE).map((p) => new Color(p.normal)),
          ],
        },
        opacity: { value: ZONE_OPACITY.ground },
        selectedOpacity: { value: ZONE_OPACITY.selected },
        outline: { value: ZONE_TOOL.outlineFraction },
        previewCode: { value: 0 },
        showGrid: { value: 0 },
      },
    });
    this.group.visible = false;
    parent.add(this.group);
  }
  setActive(active: boolean): void {
    this.material.uniforms.showGrid!.value = active ? 1 : 0;
  }
  sync(
    blocks: readonly ZoneBlock[],
    heights: Float32Array,
    owned: readonly number[],
  ): void {
    this.heightData.set(heights);
    this.texture.needsUpdate = true;
    this.release(this.staging);
    this.staging = [];
    this.build = this.generate(blocks, owned);
  }
  private *generate(
    blocks: readonly ZoneBlock[],
    owned: readonly number[],
  ): Generator<Batch> {
    // Traverse lazily so neither mesh allocation nor cell ownership checks monopolize a frame.
    let cells: { block: ZoneBlock; index: number }[] = [];
    for (const block of blocks)
      for (let index = 0; index < block.cells.length; index++) {
        if (
          block.cells[index] === ZONE_CODES.invalid ||
          !zoneCellOwned(block, index, owned)
        )
          continue;
        cells.push({ block, index });
        if (cells.length === ZONE_TOOL.renderBatchCells) {
          yield this.batch(cells);
          cells = [];
        }
      }
    if (cells.length) yield this.batch(cells);
  }
  private batch(cells: { block: ZoneBlock; index: number }[]): Batch {
    const geometry = new PlaneGeometry(
      CELL_SIZE,
      CELL_SIZE,
      ZONE_TOOL.meshSubdivisions,
      ZONE_TOOL.meshSubdivisions,
    );
    geometry.rotateX(-Math.PI / 2);
    const codes = new Float32Array(cells.length),
      selected = new Float32Array(cells.length),
      refs: string[] = [];
    const mesh = new InstancedMesh(geometry, this.material, cells.length),
      matrix = new Matrix4();
    cells.forEach(({ block, index }, i) => {
      const center = zoneCellCenter(block, index);
      matrix.makeRotationY(-Math.atan2(block.dir.z, block.dir.x));
      matrix.setPosition(center.x, 0, center.z);
      mesh.setMatrixAt(i, matrix);
      codes[i] = block.cells[index]!;
      refs.push(`${block.id}:${index}`);
      selected[i] = this.selected.has(refs[i]!) ? 1 : 0;
    });
    geometry.setAttribute('zoneCode', new InstancedBufferAttribute(codes, 1));
    geometry.setAttribute(
      'selected',
      new InstancedBufferAttribute(selected, 1),
    );
    mesh.instanceMatrix.needsUpdate = true;
    // Vertex shader lifts instances from y=0 onto the height field.
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return { mesh, refs };
  }
  update(): void {
    if (!this.build) return;
    const next = this.build.next();
    if (!next.done) {
      this.staging.push(next.value);
      return;
    }
    this.release(this.batches);
    this.batches = this.staging;
    this.staging = [];
    this.build = null;
    for (const b of this.batches) this.group.add(b.mesh);
  }
  preview(cells: readonly ZoneCell[], zone: ZoneType | null): void {
    this.selected = new Set(cells.map((c) => c.join(':')));
    this.material.uniforms.previewCode!.value = zone ? ZONE_CODES[zone] : 0;
    for (const b of [...this.batches, ...this.staging]) {
      const attr = b.mesh.geometry.getAttribute('selected');
      b.refs.forEach((key, i) => attr.setX(i, this.selected.has(key) ? 1 : 0));
      attr.needsUpdate = true;
    }
  }
  readStats(): { instances: number; pending: boolean } {
    return {
      instances: this.batches.reduce((sum, b) => sum + b.refs.length, 0),
      pending: this.build !== null,
    };
  }
  private release(batches: Batch[]): void {
    for (const b of batches) {
      b.mesh.removeFromParent();
      b.mesh.geometry.dispose();
      b.mesh.dispose();
    }
  }
  dispose(): void {
    this.build = null;
    this.release(this.batches);
    this.release(this.staging);
    this.material.dispose();
    this.texture.dispose();
    this.group.removeFromParent();
  }
}
