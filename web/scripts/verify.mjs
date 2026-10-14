import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { abiHash, sha256, json, files } from './shared.mjs';
const dist = new URL('../../dist/', import.meta.url);
const manifest = await json(new URL('imd-deployment.json', dist));
const handoff = await json(new URL('../config/deployment-handoff.json', import.meta.url));
const network = await json(new URL('../config/network-handoff.json', import.meta.url));
assert.deepEqual(
  Object.keys(manifest).sort(),
  [
    'version',
    'launchId',
    'chainId',
    'sourceCommit',
    'attestationHash',
    'contracts',
    'assets',
    ...Object.keys(network),
    ...(handoff.poolKey ? ['poolKey'] : []),
  ].sort(),
);
for (const k of ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash'])
  assert.deepEqual(manifest[k], handoff[k]);
assert.deepEqual(manifest.network, network.network);
assert.deepEqual(manifest.walletAddChain, network.walletAddChain);
assert.deepEqual(manifest.poolKey, handoff.poolKey);
assert.deepEqual(
  manifest.contracts,
  handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
    abiPath: `abi/${name}.json`,
  })),
);
const inventory = await files(dist.pathname);
assert.deepEqual(
  manifest.assets.map((a) => a.path).sort(),
  inventory.filter((p) => p !== 'imd-deployment.json'),
);
assert(manifest.assets.length <= 128);
let total = 0;
for (const asset of manifest.assets) {
  assert(
    /^[\w./-]+$/.test(asset.path) &&
      !asset.path.startsWith('/') &&
      !asset.path.split('/').includes('..'),
  );
  const bytes = await readFile(new URL(asset.path, dist));
  total += bytes.length;
  assert(bytes.length <= 8388608);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.equal(sha256(bytes), asset.sha256, asset.path);
}
for (const c of manifest.contracts)
  assert.equal(abiHash(await json(new URL(c.abiPath, dist))), c.abiHash, c.name);
assert(total < 8 * 1024 * 1024, 'Keep the full source and export bundle under 8 MiB');
const html = await readFile(new URL('index.html', dist), 'utf8');
assert(!/(?:src|href)="\/(?!\/)/.test(html), 'Export must have relative asset paths');
console.log(
  JSON.stringify(
    {
      result: 'PASS',
      assets: manifest.assets.length,
      assetBytes: total,
      contractAbis: manifest.contracts.length,
      sourceCommit: manifest.sourceCommit,
    },
    null,
    2,
  ),
);
