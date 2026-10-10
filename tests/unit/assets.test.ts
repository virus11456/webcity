import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { parseAssetManifest } from '../../src/core/assetManifest';
import { disposeAsset } from '../../src/render/assets';

describe('asset pipeline', () => {
  it('ships real Meshopt geometry and Basis KTX2 bytes', () => {
    const manifest = parseAssetManifest(
      JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')),
    );
    const model = readFileSync(`public/assets/${manifest.models[0]!.url}`);
    const data = JSON.parse(
      model.subarray(20, 20 + model.readUInt32LE(12)).toString(),
    ) as { extensionsRequired: string[]; images: { mimeType: string }[] };
    expect(data.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
    expect(data.images[0]?.mimeType).toBe('image/ktx2');
    expect(
      model.includes(
        Buffer.from([
          0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a,
          0x0a,
        ]),
      ),
    ).toBe(true);
  });
  it('disposes shared geometry, material and texture exactly once', () => {
    const root = new Group(),
      geometry = new BoxGeometry(),
      texture = new Texture();
    const material = new MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
    });
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const gs = vi.spyOn(geometry, 'dispose'),
      ms = vi.spyOn(material, 'dispose'),
      ts = vi.spyOn(texture, 'dispose');
    disposeAsset(root);
    expect(gs).toHaveBeenCalledTimes(1);
    expect(ms).toHaveBeenCalledTimes(1);
    expect(ts).toHaveBeenCalledTimes(1);
  });
});
