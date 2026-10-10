import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type Material,
} from 'three';
import { BUILDING_RENDER as R } from '../../data/buildingRendering';

/** Compact slots, geometric growth and swap-delete. The pool owns its geometry clone. */
export class InstancePool {
  mesh: InstancedMesh;
  private readonly slots = new Map<string, number>();
  private readonly keys: string[] = [];
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  constructor(
    private readonly parent: Group,
    geometry: BufferGeometry,
    private readonly material: Material,
    capacity: number = R.initialCapacity,
  ) {
    this.mesh = this.create(geometry.clone(), capacity);
    parent.add(this.mesh);
  }
  private create(geometry: BufferGeometry, capacity: number): InstancedMesh {
    geometry.setAttribute(
      'buildingState',
      new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
        DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      'buildingFade',
      new InstancedBufferAttribute(
        new Float32Array(capacity).fill(1),
        1,
      ).setUsage(DynamicDrawUsage),
    );
    const mesh = new InstancedMesh(geometry, this.material, capacity);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    mesh.instanceColor!.setUsage(DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    // Animated instances move outside a previous bounding sphere; bounded LOD is managed above.
    mesh.frustumCulled = false;
    return mesh;
  }
  set(key: string, matrix: Matrix4, color: Color, state = 0, fade = 1): void {
    let slot = this.slots.get(key);
    if (slot === undefined) {
      slot = this.keys.length;
      if (slot === this.mesh.instanceMatrix.count) this.grow();
      this.keys.push(key);
      this.slots.set(key, slot);
      this.mesh.count = this.keys.length;
    }
    this.mesh.setMatrixAt(slot, matrix);
    this.mesh.setColorAt(slot, color);
    const attribute = this.mesh.geometry.getAttribute('buildingState');
    attribute.setX(slot, state);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    attribute.needsUpdate = true;
    const alpha = this.mesh.geometry.getAttribute('buildingFade');
    alpha.setX(slot, fade);
    alpha.needsUpdate = true;
  }
  private grow(): void {
    const previous = this.mesh;
    const next = this.create(
      previous.geometry.clone(),
      previous.instanceMatrix.count * 2,
    );
    next.count = previous.count;
    next.castShadow = previous.castShadow;
    next.receiveShadow = previous.receiveShadow;
    next.instanceMatrix.array.set(previous.instanceMatrix.array);
    next.instanceColor!.array.set(previous.instanceColor!.array);
    (next.geometry.getAttribute('buildingState').array as Float32Array).set(
      previous.geometry.getAttribute('buildingState').array,
    );
    next.instanceMatrix.needsUpdate = next.instanceColor!.needsUpdate = true;
    next.geometry.getAttribute('buildingState').needsUpdate = true;
    (next.geometry.getAttribute('buildingFade').array as Float32Array).set(
      previous.geometry.getAttribute('buildingFade').array,
    );
    next.geometry.getAttribute('buildingFade').needsUpdate = true;
    previous.removeFromParent();
    previous.geometry.dispose();
    previous.dispose();
    this.parent.add(next);
    this.mesh = next;
  }
  remove(key: string): void {
    const slot = this.slots.get(key);
    if (slot === undefined) return;
    const last = this.keys.length - 1,
      lastKey = this.keys[last]!;
    if (slot !== last) {
      this.mesh.getMatrixAt(last, this.matrix);
      this.mesh.getColorAt(last, this.color);
      this.set(
        key,
        this.matrix,
        this.color,
        this.mesh.geometry.getAttribute('buildingState').getX(last),
        this.mesh.geometry.getAttribute('buildingFade').getX(last),
      );
      this.keys[slot] = lastKey;
      this.slots.set(lastKey, slot);
    }
    this.keys.pop();
    this.slots.delete(key);
    this.mesh.count = this.keys.length;
  }
  get count(): number {
    return this.keys.length;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
    this.keys.length = 0;
    this.slots.clear();
  }
}

/** Hash geometry content, including colors/UVs, rather than seed or object identity. */
export function geometryHash(geometry: BufferGeometry): string {
  let hash = 2166136261;
  for (const name of ['position', 'normal', 'color', 'uv']) {
    const a = geometry.getAttribute(name).array;
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < bytes.length; i++)
      hash = Math.imul(hash ^ bytes[i]!, 16777619);
  }
  return `${geometry.getAttribute('position').count}:${hash >>> 0}`;
}
export function sameGeometry(a: BufferGeometry, b: BufferGeometry): boolean {
  for (const name of ['position', 'normal', 'color', 'uv']) {
    const x = a.getAttribute(name).array,
      y = b.getAttribute(name).array;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  }
  return true;
}
