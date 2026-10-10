import { POWER } from '../data/power';
import {
  Scene,
  OrthographicCamera,
  WebGLRenderTarget,
  Mesh,
  MeshStandardMaterial,
  HemisphereLight,
  DirectionalLight,
  Box3,
  Vector3,
  Vector4,
  Color,
  SRGBColorSpace,
  type WebGLRenderer,
} from 'three';
import type { Building } from '../world/types';
import { catalogModel } from '../world/modelCatalog';
import { facilityModel } from '../world/facilityModels';
import { catalogGeometry } from './buildings/catalogGeometry';
import { facilityGeometry, facilityRotor } from './facilities/geometry';
import { generateBuilding } from './buildings/generator';
import { createWindowAtlas } from './buildings/windowAtlas';
import { ZONES, type ZoneType } from '../data/zones';
import { UI_ART as U } from '../data/uiArt';
import { BUILDING_DETAIL_PALETTE as P, FIRE_PALETTE } from '../data/palette';
/** Bounded still-image cache using the city's existing WebGL context and original model sources. */
export class BuildingThumbnails {
  private readonly cache = new Map<string, string>();
  private readonly target = new WebGLRenderTarget(
    U.thumbnailWidth,
    U.thumbnailHeight,
  );
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly atlas = createWindowAtlas();
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    map: this.atlas.map,
    roughness: 0.85,
  });
  private disposed = false;
  constructor(private readonly renderer: WebGLRenderer) {
    this.target.texture.colorSpace = SRGBColorSpace;
    const sun = new DirectionalLight(P.atlasWhite, 3);
    sun.position.set(-30, 60, 40);
    this.scene.add(new HemisphereLight(P.atlasWhite, P.concrete, 1.2), sun);
  }
  render(b: Building): string | undefined {
    if (this.disposed) return;
    const model = catalogModel(b),
      facility = facilityModel(b.defId);
    const key = [
      model?.id ?? b.defId,
      b.level,
      b.lotW,
      b.lotD,
      b.seed,
      b.state,
    ].join(':');
    const cached = this.cache.get(key);
    if (cached) return cached;
    const geometry = model
      ? catalogGeometry(model, 0)
      : facility
        ? facilityGeometry(facility, 0)
        : b.defId in ZONES
          ? generateBuilding(
              b.defId as ZoneType,
              b.level,
              b.lotW,
              b.lotD,
              b.seed,
              true,
            )
          : undefined;
    if (!geometry) return;
    const mesh = new Mesh(geometry, this.material);
    this.scene.add(mesh);
    const rotor =
      facility?.defId === 'power_wind'
        ? new Mesh(facilityRotor(0), this.material)
        : undefined;
    if (rotor) {
      rotor.position.set(0, POWER.rotorHeightM, -facility!.d * 4 + 3);
      mesh.add(rotor);
    }
    const box = new Box3().setFromObject(mesh),
      size = box.getSize(new Vector3()),
      center = box.getCenter(new Vector3());
    const extent = size.length() * U.thumbnailPadding,
      aspect = U.thumbnailWidth / U.thumbnailHeight;
    this.camera.position
      .copy(center)
      .add(new Vector3(extent, extent * 0.8, extent));
    this.camera.lookAt(center);
    this.camera.left = (-extent * aspect) / 2;
    this.camera.right = (extent * aspect) / 2;
    this.camera.top = extent / 2;
    this.camera.bottom = -extent / 2;
    this.camera.near = 0.1;
    this.camera.far = extent * 5;
    this.camera.updateProjectionMatrix();
    this.material.color.set(
      b.state === 'burned' ? FIRE_PALETTE.char : P.atlasWhite,
    );
    const oldTarget = this.renderer.getRenderTarget(),
      viewport = this.renderer.getViewport(new Vector4()),
      scissor = this.renderer.getScissor(new Vector4()),
      scissorTest = this.renderer.getScissorTest(),
      clear = this.renderer.getClearColor(new Color()),
      alpha = this.renderer.getClearAlpha(),
      autoClear = this.renderer.autoClear;
    try {
      this.renderer.setRenderTarget(this.target);
      this.renderer.setScissorTest(false);
      this.renderer.setClearColor(P.atlasBlack, 0);
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, this.camera);
      const pixels = new Uint8Array(U.thumbnailWidth * U.thumbnailHeight * 4);
      this.renderer.readRenderTargetPixels(
        this.target,
        0,
        0,
        U.thumbnailWidth,
        U.thumbnailHeight,
        pixels,
      );
      const canvas = document.createElement('canvas');
      canvas.width = U.thumbnailWidth;
      canvas.height = U.thumbnailHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const image = ctx.createImageData(canvas.width, canvas.height),
        stride = canvas.width * 4;
      for (let y = 0; y < canvas.height; y++)
        image.data.set(
          pixels.subarray(
            (canvas.height - 1 - y) * stride,
            (canvas.height - y) * stride,
          ),
          y * stride,
        );
      ctx.putImageData(image, 0, 0);
      const url = canvas.toDataURL('image/png');
      if (this.cache.size >= U.thumbnailCache)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, url);
      return url;
    } finally {
      this.renderer.setRenderTarget(oldTarget);
      this.renderer.setViewport(viewport);
      this.renderer.setScissor(scissor);
      this.renderer.setScissorTest(scissorTest);
      this.renderer.setClearColor(clear, alpha);
      this.renderer.autoClear = autoClear;
      mesh.removeFromParent();
      geometry.dispose();
      rotor?.geometry.dispose();
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cache.clear();
    this.target.dispose();
    this.material.dispose();
    this.atlas.dispose();
    this.scene.clear();
  }
}
