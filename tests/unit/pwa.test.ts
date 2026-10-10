import { afterEach, describe, expect, it, vi } from 'vitest';
import { inflateSync } from 'node:zlib';
import { ICONS, generateIcon } from '../../scripts/generateIcons.ts';
import { requestPersistentStorage } from '@/pwa/register';

afterEach(() => vi.unstubAllGlobals());

describe('original PWA icons', () => {
  it.each(ICONS)(
    '$name has valid dimensions and maskable-safe artwork',
    ({ size }) => {
      const png = generateIcon(size);
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      expect(png[25]).toBe(2); // Opaque RGB.
      const dataSize = png.readUInt32BE(33);
      const pixels = inflateSync(png.subarray(41, 41 + dataSize));
      expect(pixels.length).toBe((size * 3 + 1) * size);
      let skylinePixels = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (pixels[y * (size * 3 + 1) + 1 + x * 3] === 255) {
            skylinePixels++;
            expect(
              Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5),
            ).toBeLessThan(0.4);
          }
        }
      }
      expect(skylinePixels).toBeGreaterThan(size * size * 0.1);
      expect(generateIcon(size)).toEqual(png);
    },
  );
});

describe('persistent storage', () => {
  it('requests persistence when supported', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });
  it.each([
    {},
    { storage: { persist: async () => false } },
    {
      storage: {
        persist: async () => {
          throw new Error('denied');
        },
      },
    },
  ])('tolerates unsupported, denied or blocked storage', async (navigator) => {
    vi.stubGlobal('navigator', navigator);
    expect(await requestPersistentStorage()).toBe(false);
  });
});
