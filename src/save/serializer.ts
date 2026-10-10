import { encode, decode, ExtensionCodec } from '@msgpack/msgpack';
import { SAVE } from '../data/persistence';
import type { WorldSnapshot } from '../world/snapshot';
import { migrateSave } from './migrations';
const codec = new ExtensionCodec();
for (const type of [1, 2])
  codec.register({
    type,
    encode(value) {
      if (
        !(type === 1
          ? value instanceof Float32Array
          : value instanceof Int32Array)
      )
        return null;
      const array = value as Float32Array | Int32Array;
      const bytes = new Uint8Array(array.length * 4),
        view = new DataView(bytes.buffer);
      for (let i = 0; i < array.length; i++) {
        if (type === 1) view.setFloat32(i * 4, array[i]!, true);
        else view.setInt32(i * 4, array[i]!, true);
      }
      return bytes;
    },
    decode(bytes) {
      if (bytes.length % 4) throw new Error('Invalid typed array');
      const array =
        type === 1
          ? new Float32Array(bytes.length / 4)
          : new Int32Array(bytes.length / 4);
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      for (let i = 0; i < array.length; i++)
        array[i] =
          type === 1
            ? view.getFloat32(i * 4, true)
            : view.getInt32(i * 4, true);
      return array;
    },
  });
async function transform(
  bytes: Uint8Array<ArrayBuffer>,
  compress: boolean,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(
      compress
        ? new CompressionStream('gzip')
        : new DecompressionStream('gzip'),
    );
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > SAVE.maxBytes) throw new Error('Save exceeds size limit');
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
/** Encode stable key ordering, exact typed arrays and an eight-byte WCTY/version header. */
export async function serialize(snapshot: WorldSnapshot): Promise<ArrayBuffer> {
  const raw = encode(snapshot, {
    extensionCodec: codec,
    sortKeys: true,
    ignoreUndefined: true,
  });
  if (raw.length > SAVE.maxBytes) throw new Error('Save exceeds size limit');
  const packed = await transform(new Uint8Array(raw), true),
    bytes = new Uint8Array(packed.length + 8);
  bytes.set([87, 67, 84, 89]);
  new DataView(bytes.buffer).setUint32(4, SAVE.version, true);
  bytes.set(packed, 8);
  return bytes.buffer;
}
/** Decode and validate fully before the Worker may replace its authoritative world. */
export async function deserialize(data: ArrayBuffer): Promise<WorldSnapshot> {
  if (
    !(data instanceof ArrayBuffer) ||
    data.byteLength < 9 ||
    data.byteLength > SAVE.maxBytes
  )
    throw new Error('Invalid save size');
  const bytes = new Uint8Array(data);
  if (![87, 67, 84, 89].every((b, i) => bytes[i] === b))
    throw new Error('Invalid save header');
  const version = new DataView(data).getUint32(4, true);
  if (version !== SAVE.version) throw new Error('Unsupported save version');
  const raw = await transform(bytes.slice(8), false);
  return migrateSave(
    decode(raw, {
      extensionCodec: codec,
      maxArrayLength: 1000000,
      maxMapLength: 128,
      maxStrLength: 100000,
      maxBinLength: SAVE.maxBytes,
      maxExtLength: SAVE.maxBytes,
    }),
    version,
  );
}
