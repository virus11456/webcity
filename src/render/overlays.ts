import { TrafficOverlay } from './trafficOverlay';
import {
  Color,
  DataTexture,
  RGBAFormat,
  NearestFilter,
  UnsignedByteType,
  Mesh,
  LineSegments,
  type Material,
  type Object3D,
  type Scene,
} from 'three';
import { MAP_SIZE, WORLD, CELL_SIZE } from '../data/config';
import { UI_PALETTE, BUILDING_DETAIL_PALETTE } from '../data/palette';
import { INFO, type InfoView } from '../data/infoViews';
import { infoValues, type InfoWorld } from '../world/infoViews';
import type { SimEvent } from '../bridge/protocol';
import type { Building } from '../world/types';
import { zoneBuildingFootprint, polygonBounds } from '../world/zoneGeometry';
type Hook = Material['onBeforeCompile'];
const scale = UI_PALETTE.infoScale.map((c) => new Color(c));
export function infoColor(value: number, out: Color): Color {
  const index = (1 - Math.max(0, Math.min(1, value))) * (scale.length - 1),
    lower = Math.floor(index);
  return out
    .copy(scale[lower]!)
    .lerp(scale[Math.min(lower + 1, scale.length - 1)]!, index - lower);
}
/** Composes after terrain, building and CSM hooks; shared uniforms change without recompiling. */
export function infoShader(
  material: Material,
  role: string,
  active: { value: number },
  texture: DataTexture,
  buildings: DataTexture,
  previous: Hook,
): Hook {
  return (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (!shader.fragmentShader.includes('#include <opaque_fragment>')) return;
    Object.assign(shader.uniforms, {
      cityInfoActive: active,
      cityInfoMap: { value: texture },
      cityInfoBuildings: { value: buildings },
    });
    if (shader.fragmentShader.includes('uniform float cityInfoActive;')) return;
    shader.vertexShader =
      `varying vec2 cityInfoWorld; varying vec3 cityInfoInstance;\n${shader.vertexShader}`.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
      vec4 cityInfoPosition=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        cityInfoPosition=instanceMatrix*cityInfoPosition;
      #endif
      cityInfoWorld=(modelMatrix*cityInfoPosition).xz;
      cityInfoInstance=vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
        cityInfoInstance=instanceColor;
      #endif`,
      );
    shader.fragmentShader =
      `uniform float cityInfoActive; uniform sampler2D cityInfoMap; uniform sampler2D cityInfoBuildings; varying vec2 cityInfoWorld; varying vec3 cityInfoInstance;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
      if(cityInfoActive>0.5) {
        float cityGray=dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722));
        vec3 cityBase=mix(gl_FragColor.rgb,vec3(cityGray),${INFO.grayscale});
        ${role === 'instance' ? `gl_FragColor.rgb=cityInfoInstance*(${INFO.minLight}+(1.0-${INFO.minLight})*cityGray);` : role === 'field' || role === 'building' ? `vec4 citySample=texture2D(${role === 'field' ? 'cityInfoMap' : 'cityInfoBuildings'},(cityInfoWorld+${MAP_SIZE / 2}.0)/${MAP_SIZE}.0);gl_FragColor.rgb=mix(cityBase,citySample.rgb,citySample.a*${INFO.groundOpacity});` : 'gl_FragColor.rgb=cityBase;'}
      }`,
      );
  };
}
export class InfoOverlays {
  private readonly traffic: TrafficOverlay;
  private view: InfoView | null = null;
  private world: InfoWorld | undefined;
  private byId = new Map<number, Building>();
  private dirty = false;
  private age: number = INFO.refreshSeconds;
  readonly active = { value: 0 };
  readonly texture = new DataTexture(
    new Uint8Array(WORLD.fieldCells ** 2 * 4),
    WORLD.fieldCells,
    WORLD.fieldCells,
    RGBAFormat,
    UnsignedByteType,
  );
  private readonly buildingSize = MAP_SIZE / CELL_SIZE;
  private readonly buildingTexture = new DataTexture(
    new Uint8Array(this.buildingSize ** 2 * 4),
    this.buildingSize,
    this.buildingSize,
    RGBAFormat,
    UnsignedByteType,
  );
  private readonly color = new Color();
  private readonly installed = new Map<
    Material,
    {
      previous: Hook;
      wrapper: Hook;
      key: Material['customProgramCacheKey'];
      wrappedKey: Material['customProgramCacheKey'];
      role: string;
    }
  >();
  constructor(
    private scene: Scene,
    private onColors: (colors: ReadonlyMap<number, string> | null) => void,
    private buildingGroups: readonly Object3D[] = [],
  ) {
    this.traffic = new TrafficOverlay(scene);
    for (const t of [this.texture, this.buildingTexture]) {
      t.minFilter = t.magFilter = NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
    }
  }
  set(view: InfoView | null) {
    if (view === this.view) return;
    this.view = view;
    this.traffic.set(view === 'traffic');
    this.active.value = Number(view !== null);
    this.dirty = true;
    this.age = INFO.refreshSeconds;
    if (!view) this.onColors(null);
  }
  accept(e: SimEvent) {
    this.traffic.accept(e);
    if (e.t === 'ready') {
      this.world = {
        seed: e.snapshot.seed,
        fields: structuredClone(e.snapshot.fields),
        terrain: structuredClone(e.snapshot.terrain),
        buildings: [],
      };
      this.byId = new Map(
        e.snapshot.buildings.map((b) => [b.id, structuredClone(b)]),
      );
      this.dirty = true;
    } else if (e.t === 'buildingsChanged') {
      for (const b of e.added) this.byId.set(b.id, structuredClone(b));
      for (const p of e.updated) {
        const b = this.byId.get(p.id);
        if (b) Object.assign(b, structuredClone(p));
      }
      for (const id of e.removed) this.byId.delete(id);
      this.dirty = true;
    } else if (e.t === 'roadsChanged' && e.terrain && this.world) {
      e.terrain.indices.forEach((index, i) => {
        this.world!.terrain.heights[index] = e.terrain!.heights[i]!;
      });
      this.world.terrain.revision = e.terrain.revision;
      this.dirty = true;
    } else if (e.t === 'fields' && this.world) {
      if (e.which.startsWith('coverage.'))
        this.world.fields.coverage[
          e.which.slice(9) as keyof InfoWorld['fields']['coverage']
        ] = e.data.slice();
      else
        this.world.fields[
          e.which as 'pollution' | 'noise' | 'waterPollution' | 'landValue'
        ] = e.data.slice();
      this.dirty = true;
    }
  }
  private scan() {
    const inBuilding = (o: Object3D) => {
      let p: Object3D | null = o;
      while (p) {
        if (this.buildingGroups.includes(p)) return true;
        p = p.parent;
      }
      return false;
    };
    this.scene.traverse((o) => {
      if (!(o instanceof Mesh || o instanceof LineSegments)) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const material of list) {
        const role = String(
          material.userData.infoRole ?? (inBuilding(o) ? 'building' : 'gray'),
        );
        if (role === 'preserve') continue;
        const old = this.installed.get(material);
        if (
          old &&
          old.wrapper === material.onBeforeCompile &&
          old.role === role
        )
          continue;
        const previous =
          old && old.wrapper === material.onBeforeCompile
            ? old.previous
            : material.onBeforeCompile;
        const key =
          old && old.wrappedKey === material.customProgramCacheKey
            ? old.key
            : material.customProgramCacheKey;
        const cache = key.call(material),
          wrapper = infoShader(
            material,
            role,
            this.active,
            this.texture,
            this.buildingTexture,
            previous,
          ),
          wrappedKey = () => `${cache}:city-info-${role}`;
        material.onBeforeCompile = wrapper;
        material.customProgramCacheKey = wrappedKey;
        material.needsUpdate = true;
        this.installed.set(material, {
          previous,
          wrapper,
          key,
          wrappedKey,
          role,
        });
        if (!old)
          material.addEventListener('dispose', () =>
            this.installed.delete(material),
          );
      }
    });
  }
  update(seconds: number) {
    this.age += seconds;
    if (!this.view || !this.world || this.age < INFO.refreshSeconds) return;
    this.age = 0;
    this.traffic.update();
    this.scan();
    if (!this.dirty) return;
    this.dirty = false;
    this.world.buildings = [...this.byId.values()];
    const result = infoValues(this.view, this.world),
      data = this.texture.image.data as Uint8Array,
      paint = this.buildingTexture.image.data as Uint8Array;
    const write = (target: Uint8Array, i: number, value: number) => {
      if (!Number.isFinite(value)) {
        target[i + 3] = 0;
        return;
      }
      infoColor(value, this.color);
      target[i] = Math.round(this.color.r * 255);
      target[i + 1] = Math.round(this.color.g * 255);
      target[i + 2] = Math.round(this.color.b * 255);
      target[i + 3] = 255;
    };
    for (let i = 0; i < result.field.length; i++)
      write(data, i * 4, result.field[i]!);
    paint.fill(0);
    const colors = new Map<number, string>();
    for (const b of this.byId.values()) {
      const value = result.buildings.get(b.id);
      colors.set(
        b.id,
        value === undefined
          ? BUILDING_DETAIL_PALETTE.concrete
          : `#${infoColor(value, this.color).getHexString()}`,
      );
      if (value === undefined) continue;
      const polygon = zoneBuildingFootprint(b),
        bounds = polygonBounds(polygon),
        n = this.buildingSize;
      for (
        let z = Math.max(
          0,
          Math.floor((bounds.minZ + MAP_SIZE / 2) / CELL_SIZE),
        );
        z < Math.min(n, Math.ceil((bounds.maxZ + MAP_SIZE / 2) / CELL_SIZE));
        z++
      )
        for (
          let x = Math.max(
            0,
            Math.floor((bounds.minX + MAP_SIZE / 2) / CELL_SIZE),
          );
          x < Math.min(n, Math.ceil((bounds.maxX + MAP_SIZE / 2) / CELL_SIZE));
          x++
        ) {
          const dx = (x + 0.5) * CELL_SIZE - MAP_SIZE / 2 - b.pos.x,
            dz = (z + 0.5) * CELL_SIZE - MAP_SIZE / 2 - b.pos.z;
          const u = dx * Math.cos(b.rotation) - dz * Math.sin(b.rotation),
            v = dx * Math.sin(b.rotation) + dz * Math.cos(b.rotation);
          if (
            Math.abs(u) <= (b.lotW * CELL_SIZE) / 2 &&
            v >= 0 &&
            v <= b.lotD * CELL_SIZE
          )
            write(paint, (z * n + x) * 4, value);
        }
    }
    this.texture.needsUpdate = true;
    this.buildingTexture.needsUpdate = true;
    this.onColors(colors);
  }
  dispose() {
    this.traffic.dispose();
    this.active.value = 0;
    this.onColors(null);
    for (const [m, e] of this.installed) {
      if (m.onBeforeCompile === e.wrapper) m.onBeforeCompile = e.previous;
      if (m.customProgramCacheKey === e.wrappedKey)
        m.customProgramCacheKey = e.key;
      m.needsUpdate = true;
    }
    this.installed.clear();
    this.texture.dispose();
    this.buildingTexture.dispose();
  }
}
