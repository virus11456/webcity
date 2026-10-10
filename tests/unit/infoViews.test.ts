import { describe, expect, it } from 'vitest';
import {
  Color,
  MeshStandardMaterial,
  Mesh,
  BoxGeometry,
  Scene,
  type WebGLRenderer,
} from 'three';
import { INFO_VIEWS } from '../../src/data/infoViews';
import { UI_PALETTE } from '../../src/data/palette';
import { buildingInfo, infoValues } from '../../src/world/infoViews';
import { fieldIndex } from '../../src/world/fieldSampling';
import { InfoOverlays, infoColor, infoShader } from '../../src/render/overlays';
import { levelsState } from '../fixtures/levelsCity';
describe('authoritative information views', () => {
  it('normalizes good/bad directions, uses actual utility flags and leaves missing samples neutral', () => {
    const s = levelsState(),
      b = s.buildings[0]!;
    b.flags = 5;
    b.environment = { pollution: 25, noise: 60, waterPollution: 30 };
    b.drinkingWaterPollution = 40;
    expect(buildingInfo('power', b, s)).toBe(1);
    expect(buildingInfo('water', b, s)).toBe(0);
    expect(buildingInfo('sewage', b, s)).toBe(1);
    expect(buildingInfo('pollution', b, s)).toBe(0.75);
    expect(buildingInfo('noise', b, s)).toBe(0.4);
    expect(buildingInfo('waterPollution', b, s)).toBe(0.6);
    expect(buildingInfo('health', s.buildings[4]!, s)).toBeUndefined();
    expect(buildingInfo('waterPollution', s.buildings[4]!, s)).toBeUndefined();
    expect(buildingInfo('waterPollution', s.buildings[3]!, s)).toBeUndefined();
    const result = infoValues('water', s);
    expect(result.buildings.get(b.id)).toBe(0);
    expect(result.field[0]).toBeNaN();
    const nearby = fieldIndex(b.pos, s.fields.size);
    expect(result.field[nearby]).toBe(0);
    expect(infoValues('waterPollution', s).field[nearby]).toBeNaN();
  });
  it('provides all implemented views without writing source data; dense field endpoints map accurately', () => {
    const s = levelsState(),
      copy = structuredClone(s);
    s.fields.pollution[0] = 100;
    s.fields.pollution[1] = 0;
    for (const view of INFO_VIEWS) {
      const v = infoValues(view, s);
      expect(v.field).toHaveLength(s.fields.size ** 2);
      expect(
        [...v.buildings.values()].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 1,
        ),
      ).toBe(true);
    }
    const v = infoValues('pollution', s);
    expect(v.field[0]).toBe(0);
    expect(v.field[1]).toBe(1);
    expect(s.buildings).toEqual(copy.buildings);
    expect(s.citizens).toEqual(copy.citizens);
    expect(infoColor(1, new Color()).getHexString()).toBe(
      UI_PALETTE.infoScale[0].slice(1).toLowerCase(),
    );
    expect(infoColor(0, new Color()).getHexString()).toBe(
      UI_PALETTE.infoScale[4].slice(1).toLowerCase(),
    );
  });
  it('updates textures and instance colors after patches, composes shader hooks and restores them on disposal', () => {
    const s = levelsState(),
      scene = new Scene(),
      material = new MeshStandardMaterial(),
      mesh = new Mesh(new BoxGeometry(), material);
    scene.add(mesh);
    material.userData.infoRole = 'field';
    let colors: ReadonlyMap<number, string> | null = null;
    const overlay = new InfoOverlays(scene, (c) => (colors = c));
    overlay.accept({ t: 'ready', reqId: 1, snapshot: s });
    overlay.set('water');
    overlay.update(0.3);
    expect(colors!.get(10001)).toBe(UI_PALETTE.infoScale[0].toLowerCase());
    const shader = {
      uniforms: {},
      vertexShader: '#include <project_vertex>',
      fragmentShader: '#include <opaque_fragment>',
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.fragmentShader).toContain('cityInfoMap');
    infoShader(
      material,
      'field',
      overlay.active,
      overlay.texture,
      overlay.texture,
      material.onBeforeCompile,
    )(shader, {} as WebGLRenderer);
    expect(
      shader.fragmentShader.match(/uniform float cityInfoActive;/g),
    ).toHaveLength(1);
    expect(shader.uniforms.cityInfoActive!.value).toBe(1);
    const version = overlay.texture.version;
    overlay.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: [{ id: 10001, flags: 0 }],
    });
    overlay.update(0.3);
    expect(overlay.texture.version).toBeGreaterThan(version);
    expect(colors!.get(10001)).toBe(UI_PALETTE.infoScale[4].toLowerCase());
    // A new quality-tier shader replaces the hook; the next scan composes onto the new one.
    let called = false;
    const tier = () => {
      called = true;
    };
    material.onBeforeCompile = tier;
    overlay.update(0.3);
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(called).toBe(true);
    overlay.set(null);
    expect(overlay.active.value).toBe(0);
    expect(colors).toBeNull();
    overlay.dispose();
    expect(material.onBeforeCompile).toBe(tier);
    mesh.geometry.dispose();
    material.dispose();
  });
});
