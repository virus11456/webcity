import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function violations(source: string, filePath: string) {
  const results = await eslint.lintText(source, { filePath });
  return results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );
}

describe('TECH §2.1 module boundaries', () => {
  it.each([
    ['data', '@/core/rng'],
    ['core', '@/data/config'],
    ['world', '../sim/state'],
    ['sim', 'three'],
    ['sim/systems', 'three/examples/jsm/loaders/GLTFLoader.js'],
    ['sim', '@/bridge/simClient'],
    ['sim', '../bridge/mirror'],
    ['bridge', '@/sim/state'],
    ['render', '@/ui/App'],
    ['render', '@/tools/tool'],
    ['input', '@/sim/simulation'],
    ['tools', '@/ui/App'],
    ['ui', 'three'],
    ['ui', '@/render/renderer'],
    ['ui', '@/sim/state'],
    ['sim', '../game'],
  ])('rejects %s importing %s', async (layer, dependency) => {
    expect(
      await violations(
        `import '${dependency}';`,
        `src/${layer}/boundaryProbe.ts`,
      ),
    ).toContain('no-restricted-imports');
  });

  it.each([
    ['world', '@/core/math'],
    ['sim', '../bridge/protocol'],
    ['sim/systems', '@/bridge/protocol'],
    ['sim', '../bridge/protocol.ts'],
    ['sim', '@/world/types'],
    ['sim', './systems/time'],
    ['bridge', '@/world/types'],
    ['render', 'three'],
    ['render', '@/bridge/mirror'],
    ['input', '@/render/camera'],
    ['tools', '@/render/preview'],
    ['ui', '@/tools/tool'],
    ['ui', 'preact'],
  ])('allows %s importing %s', async (layer, dependency) => {
    expect(
      await violations(
        `import '${dependency}';`,
        `src/${layer}/boundaryProbe.ts`,
      ),
    ).toEqual([]);
  });

  it.each([
    'window.alert()',
    'document.createElement("div")',
    'Math.random()',
    'Date.now()',
  ])('rejects nondeterministic or DOM code: %s', async (source) => {
    expect(await violations(source, 'src/sim/boundaryProbe.ts')).toContain(
      source.startsWith('window') || source.startsWith('document')
        ? 'no-restricted-globals'
        : 'no-restricted-properties',
    );
  });
});
