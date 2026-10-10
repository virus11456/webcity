import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Compress a GLB atomically; never replace an output with a half-written model. */
export async function compressAsset(
  input: string,
  output: string,
  cliPath?: string,
): Promise<void> {
  if (!input.endsWith('.glb') || !output.endsWith('.glb'))
    throw new Error('Expected input.glb output.glb');
  if (resolve(input) === resolve(output))
    throw new Error('Keep the source GLB');
  const work = await mkdtemp(resolve(tmpdir(), 'webcity-asset-'));
  const cli =
    cliPath ??
    fileURLToPath(
      new URL(
        '../node_modules/@gltf-transform/cli/bin/cli.js',
        import.meta.url,
      ),
    );
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `glTF Transform ${args[0]} failed. KTX-Software 4.4+ must be on PATH.`,
      );
  };
  try {
    const texture = resolve(work, 'textures.glb');
    const compressed = resolve(work, 'compressed.glb');
    run(['etc1s', resolve(input), texture, '--quality', '255']);
    run(['meshopt', texture, compressed, '--level', 'medium']);
    run(['validate', compressed]);
    await mkdir(dirname(resolve(output)), { recursive: true });
    // Copy into the destination filesystem before the final atomic rename.
    const { copyFile } = await import('node:fs/promises');
    await copyFile(compressed, `${resolve(output)}.tmp`);
    await rename(`${resolve(output)}.tmp`, resolve(output));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [, , input, output] = process.argv;
  if (!input || !output)
    throw new Error('Usage: npm run assets:compress -- input.glb output.glb');
  await compressAsset(input, output);
}
