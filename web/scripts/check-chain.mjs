import { createPublicClient, http } from 'viem';
import { json } from './shared.mjs';
import { writeFile } from 'node:fs/promises';
const m = await json(new URL('../../dist/imd-deployment.json', import.meta.url));
const abi = await json(new URL('../../dist/abi/VeteransNFT.json', import.meta.url));
const nft = m.contracts.find((c) => c.name === 'VeteransNFT').address;
const evidence = {
  checkedAt: new Date().toISOString(),
  sourceCommit: m.sourceCommit,
  endpoints: [],
};
for (const url of m.network.rpcUrls) {
  const c = createPublicClient({ transport: http(url, { timeout: 12000, retryCount: 0 }) });
  const entry = { url };
  try {
    entry.chainId = await c.getChainId();
    if (entry.chainId !== m.chainId) throw new Error('Chain ID mismatch');
    entry.contracts = await Promise.all(
      m.contracts.map(async (contract) => ({
        name: contract.name,
        address: contract.address,
        codeBytes: ((await c.getBytecode({ address: contract.address }))?.length - 2) / 2,
      })),
    );
    if (entry.contracts.some((contract) => !contract.codeBytes))
      throw new Error('Missing deployed contract code');
    entry.state = Object.fromEntries(
      await Promise.all(
        [
          'staking',
          'claimPool',
          'imd',
          'weth',
          'owner',
          'renderer',
          'isConfigured',
          'getTransferValidator',
          'metadataFrozen',
          'totalMinted',
          'mintPrice',
          'currentEpoch',
          'difficulty',
        ].map(async (functionName) => [
          functionName,
          await c.readContract({ address: nft, abi, functionName }),
        ]),
      ),
    );
    entry.siblings = await Promise.all(
      ['staking', 'claimPool'].map(async (name) => ({
        name,
        address: entry.state[name],
        codeBytes: ((await c.getBytecode({ address: entry.state[name] }))?.length - 2) / 2,
      })),
    );
    entry.result = 'PASS';
  } catch (error) {
    entry.result = 'UNAVAILABLE';
    entry.error = (error.shortMessage || error.message).slice(0, 350);
  }
  evidence.endpoints.push(entry);
}
const output =
  JSON.stringify(evidence, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n';
await writeFile(new URL('../../docs/evidence/chain-check.json', import.meta.url), output);
console.log(output);
