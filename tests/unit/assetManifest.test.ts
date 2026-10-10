import { describe, expect, it } from 'vitest';
import { parseAssetManifest } from '../../src/core/assetManifest';
const entry = {
  id: 'bld_rl_l2_2x2_sample',
  url: 'models/bld_rl_l2_2x2_sample.123456abcdef.glb',
  license: 'Original project asset',
  author: 'WebCity',
};
describe('asset manifest', () => {
  it('accepts only versioned local models and returns a defensive copy', () => {
    const parsed = parseAssetManifest({ version: 1, models: [entry] });
    expect(parsed.models[0]).toEqual(entry);
    expect(parsed.models[0]).not.toBe(entry);
  });
  it.each([
    null,
    {},
    { version: 2, models: [] },
    { version: 1, models: [entry, entry] },
    { version: 1, models: [{ ...entry, license: '' }] },
  ])('rejects invalid manifests', (value) => {
    expect(() => parseAssetManifest(value)).toThrow();
  });
  it.each([
    'https://example.org/model.glb',
    '../model.glb',
    'models/../a.glb',
    'models/unversioned.glb',
    'models/a.123456abcdef.glb?x=1',
  ])('rejects unsafe or unversioned URL %s', (url) => {
    expect(() =>
      parseAssetManifest({ version: 1, models: [{ ...entry, url }] }),
    ).toThrow();
  });
});
