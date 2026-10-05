import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PWA_PALETTE } from '../src/data/palette.ts';

export const ICONS = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
] as const;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const tag = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  tag.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([tag, data])), data.length + 8);
  return result;
}

function rgb(hex: string): number[] {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
}

/** Encode an original skyline as opaque RGB PNG using only Node built-ins. */
export function generateIcon(size: number): Buffer {
  if (!Number.isInteger(size) || size < 16 || size > 1024) {
    throw new RangeError('Icon size must be an integer between 16 and 1024');
  }
  const background = rgb(PWA_PALETTE.background);
  const foreground = rgb(PWA_PALETTE.skyline);
  const stride = size * 3 + 1;
  const pixels = Buffer.alloc(stride * size);
  // All white pixels fit inside the maskable safe circle (radius 40%).
  const buildings = [
    [0.24, 0.47, 0.38, 0.7],
    [0.42, 0.27, 0.57, 0.7],
    [0.61, 0.39, 0.76, 0.7],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const isBuilding = buildings.some(
        ([left = 0, top = 0, right = 0, bottom = 0]) =>
          nx >= left && nx <= right && ny >= top && ny <= bottom,
      );
      const isBase = nx >= 0.24 && nx <= 0.76 && ny >= 0.7 && ny <= 0.74;
      const color = isBuilding || isBase ? foreground : background;
      const offset = y * stride + 1 + x * 3;
      pixels.set(color, offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2; // RGB, no alpha; PNG row filter 0 from Buffer.alloc.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = new URL('../public/icons/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const icon of ICONS) {
    await writeFile(new URL(icon.name, directory), generateIcon(icon.size));
    console.log(`Generated ${icon.name} (${icon.size}×${icon.size})`);
  }
}
