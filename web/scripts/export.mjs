import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { erc20Abi } from 'viem';
import { abiHash, sha256, json, files } from './shared.mjs';
const handoff = await json(new URL('../config/deployment-handoff.json', import.meta.url));
const network = await json(new URL('../config/network-handoff.json', import.meta.url));
const root = new URL('../../', import.meta.url);
const dist = new URL('../../dist/', import.meta.url);
await mkdir(new URL('abi/', dist), { recursive: true });
for (const name of [
  'VeteransNFT',
  'VeteransRenderer',
  'VeteransStaking',
  'VeteransClaimPool',
  'WethUnwrapper',
]) {
  const pinned = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${name}.json`], {
    cwd: root,
    encoding: 'utf8',
  });
  const abi = JSON.parse(pinned);
  if (!Array.isArray(abi)) throw new Error(`${name} is not a raw ABI array`);
  const entry = handoff.contracts.find((c) => c.name === name);
  if (entry && abiHash(abi) !== entry.abiHash)
    throw new Error(`${name} ABI hash does not match the attested handoff`);
  await writeFile(new URL(`abi/${name}.json`, dist), JSON.stringify(abi));
}
await writeFile(new URL('abi/ERC20.json', dist), JSON.stringify(erc20Abi));
// Interface of the deployed modular validator, not the older ERC721C validator.
// ABI/source provenance and read-only chain validation: docs/WALLET-RPC-VALIDATION.md.
const validatorAbi = await json(new URL('../config/transfer-validator.json', import.meta.url));
await writeFile(new URL('abi/TransferValidator.json', dist), JSON.stringify(validatorAbi));
const contracts = handoff.contracts.map(({ name, address, abiHash }) => ({
  name,
  address,
  abiHash,
  abiPath: `abi/${name}.json`,
}));
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets: [],
};
if (handoff.poolKey) manifest.poolKey = handoff.poolKey;
Object.assign(manifest, network);
for (const path of await files(dist.pathname)) {
  if (path === 'imd-deployment.json') continue;
  const bytes = await readFile(new URL(path, dist));
  if (bytes.length > 8388608) throw new Error(`Oversized asset: ${path}`);
  manifest.assets.push({ path, sha256: sha256(bytes) });
}
if (manifest.assets.length > 128) throw new Error('More than 128 assets');
await writeFile(new URL('imd-deployment.json', dist), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Exported ${manifest.assets.length} assets; pinned contract ABI hashes verified.`);
