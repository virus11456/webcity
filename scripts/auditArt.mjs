/** Read-only audit of every shipped GLB, naming, LOD budgets and aggregate asset sizes. */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { format } from 'prettier';
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const manifest = JSON.parse(
  await readFile('public/assets/manifest.json', 'utf8'),
);
const models = [],
  failures = [];
for (const entry of manifest.models) {
  const bytes = await readFile(`public/assets/${entry.url}`);
  if (
    !entry.url.includes(
      createHash('sha256').update(bytes).digest('hex').slice(0, 12),
    )
  )
    failures.push(`${entry.id}: hash`);
  const root = (await io.readBinary(bytes)).getRoot();
  const counts = [0, 0, 0];
  for (const node of root.listNodes()) {
    const match = /^(?:LOD|Rotor)([012])$/.exec(node.getName());
    if (!match) continue;
    for (const p of node.getMesh()?.listPrimitives() ?? [])
      counts[Number(match[1])] +=
        (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) /
        3;
  }
  const category = entry.id.startsWith('veh_')
    ? 'vehicle'
    : /^bld_(rh|ch|o)_/.test(entry.id)
      ? 'high'
      : entry.id === 'svc_tree'
        ? 'tree'
        : 'low';
  const budget = {
    vehicle: [600, 100, 0],
    high: [4000, 600, 24],
    tree: [400, 60, 12],
    low: [1500, 300, 12],
  }[category];
  if (counts.some((n, i) => n > budget[i]))
    failures.push(`${entry.id}: triangles ${counts}`);
  if (!/^(?:bld_|svc_|veh_)/.test(entry.id))
    failures.push(`${entry.id}: naming`);
  models.push({ id: entry.id, bytes: bytes.length, triangles: counts, budget });
}
const audio = [];
for (const name of await readdir('public/assets/audio/music'))
  audio.push({
    name,
    bytes: (await stat(`public/assets/audio/music/${name}`)).size,
  });
const report = {
  modelCount: models.length,
  modelBytes: models.reduce((s, m) => s + m.bytes, 0),
  musicBytes: audio.reduce((s, m) => s + m.bytes, 0),
  failures,
  models,
  audio,
};
await writeFile(
  'docs/art-audit.json',
  await format(JSON.stringify(report), { parser: 'json' }),
);
console.log(
  JSON.stringify({
    modelCount: report.modelCount,
    modelBytes: report.modelBytes,
    musicBytes: report.musicBytes,
    failures,
  }),
);
if (failures.length) process.exitCode = 1;
