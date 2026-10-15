// Read-only diagnostic: eth_call and eth_estimateGas, never a wallet or broadcast.
// Run: node --import tsx scripts/check-policy.mjs (from web/).
import { createPublicClient, http, keccak256 } from 'viem';
import { writeFile } from 'node:fs/promises';
import { json } from './shared.mjs';
import { readTransferPolicy, transferPolicyArgs } from '../src/validator.ts';
import { errorText } from '../src/utils.ts';

const manifest = await json(new URL('../../dist/imd-deployment.json', import.meta.url));
const nftAbi = await json(new URL('../../dist/abi/VeteransNFT.json', import.meta.url));
const abi = await json(new URL('../../dist/abi/TransferValidator.json', import.meta.url));
const nft = manifest.contracts.find((c) => c.name === 'VeteransNFT').address;
const evidence = {
  checkedAt: new Date().toISOString(),
  mode: 'Read-only eth_call and eth_estimateGas using the on-chain owner as from; no transactions sent.',
  interfaceSource:
    'https://github.com/limitbreakinc/creator-token-transfer-validator/tree/59adb8b36ab0256c7430b017b1c9f8b4841d6e1e',
  endpoints: [],
};
for (const url of manifest.network.rpcUrls) {
  const publicClient = createPublicClient({
    transport: http(url, { timeout: 8000, retryCount: 0 }),
  });
  const entry = { url, checks: [] };
  try {
    entry.chainId = await publicClient.getChainId();
    if (entry.chainId !== manifest.chainId) throw new Error('Wrong RPC chain');
    const [owner, validator] = await Promise.all(
      ['owner', 'getTransferValidator'].map((functionName) =>
        publicClient.readContract({ address: nft, abi: nftAbi, functionName }),
      ),
    );
    Object.assign(entry, { owner, validator });
    entry.codeHash = keccak256(await publicClient.getBytecode({ address: validator }));
    const policy = await readTransferPolicy(
      { publicClient, nft, abis: { TransferValidator: abi } },
      validator,
    );
    entry.policy = policy;
    entry.allowlistRuleset = await publicClient.readContract({
      address: validator,
      abi,
      functionName: 'boundRuleset',
      args: [4],
    });
    for (const [functionName, args] of [
      ['setRulesetOfCollection', transferPolicyArgs(nft, true)],
      ['setRulesetOfCollection', transferPolicyArgs(nft, false)],
      // Reapplying the currently selected list verifies the real selector without inventing a list ID.
      ['applyListToCollection', [nft, policy.listId]],
    ]) {
      try {
        const request = {
          address: validator,
          abi,
          functionName,
          args,
          account: owner,
        };
        await publicClient.simulateContract(request);
        const gas = await publicClient.estimateContractGas(request);
        entry.checks.push({ functionName, args, gas, result: 'PASS' });
      } catch (error) {
        entry.checks.push({
          functionName,
          args,
          result: 'FAIL',
          error: errorText(error),
        });
      }
    }
    entry.result = entry.checks.every((c) => c.result === 'PASS') ? 'PASS' : 'FAIL';
  } catch (error) {
    entry.result = 'UNAVAILABLE';
    entry.error = errorText(error);
  }
  evidence.endpoints.push(entry);
}
const output =
  JSON.stringify(evidence, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n';
await writeFile(new URL('../../docs/evidence/policy-check.json', import.meta.url), output);
console.log(output);
if (evidence.endpoints.some((e) => e.result !== 'PASS')) process.exitCode = 1;
