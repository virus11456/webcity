import { it, expect, vi, afterEach } from 'vitest';
import { ambientMix, effectForEvent } from '../../src/audio/mix';
import { readPreferences } from '../../src/ui/preferences';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { readFileSync, statSync } from 'node:fs';
import { SFX, AMBIENCE } from '../../src/data/soundConfig';
afterEach(() => vi.unstubAllGlobals());
it('mixes near traffic, people, industry and water while distant views retain wind', () => {
  const near = ambientMix(40, 1, 1, 1, 1),
    far = ambientMix(2000, 1, 1, 1, 1),
    park = ambientMix(40, 0, 0, 0, 0);
  expect(near.industry).toBeGreaterThan(far.industry);
  expect(near.water).toBeGreaterThan(0);
  expect(far.traffic).toBe(0);
  expect(far.wind).toBeGreaterThan(near.wind);
  expect(park.birds).toBeGreaterThan(near.birds);
  for (const value of Object.values(ambientMix(-50, 10, 10, 10, 10)))
    expect(value).toBeGreaterThanOrEqual(0);
});
it('plays effects only for acknowledged actions and milestones, not ordinary population updates', () => {
  expect(effectForEvent({ t: 'result', reqId: 1, ok: false })).toBe('error');
  expect(effectForEvent({ t: 'milestone', index: 2 })).toBe('milestone');
  const b = districtFixture(1)[0]!;
  expect(
    effectForEvent({
      t: 'buildingsChanged',
      added: [b],
      updated: [],
      removed: [],
    }),
  ).toBeUndefined();
  expect(
    effectForEvent({
      t: 'buildingsChanged',
      added: [{ ...b, kind: 'service' }],
      updated: [],
      removed: [],
    }),
  ).toBe('place');
  expect(
    effectForEvent({
      t: 'buildingsChanged',
      added: [],
      updated: [],
      removed: [1],
    }),
  ).toBe('demolish');
});
it('migrates old preferences and bounds corrupted audio volumes', () => {
  vi.stubGlobal('localStorage', {
    getItem: () =>
      JSON.stringify({ volume: 500, sfxVolume: -2, ambientVolume: 'loud' }),
  });
  expect(readPreferences()).toMatchObject({
    volume: 100,
    sfxVolume: 0,
    ambientVolume: 45,
  });
  vi.stubGlobal('localStorage', { getItem: () => null });
  expect(readPreferences().volume).toBe(60);
});
it('ships valid dual-format original audio under the 50 KB sound budget', () => {
  for (const id of [...SFX, ...AMBIENCE])
    for (const ext of ['ogg', 'mp3']) {
      const file = `public/assets/audio/${id}.${ext}`;
      expect(statSync(file).size).toBeLessThan(50000);
      expect(statSync(file).size).toBeGreaterThan(500);
      if (ext === 'ogg')
        expect(readFileSync(file).subarray(0, 4).toString()).toBe('OggS');
    }
});
