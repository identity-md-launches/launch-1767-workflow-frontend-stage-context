import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { concat, keccak256, numberToHex, type Abi, type Address, type EIP1193Provider } from 'viem';
import { findProofSlice, hashFor } from '../src/pow';
import { amount, errorText, validAddress } from '../src/utils';
import { canonicalAbiHash } from '../src/config';
import { switchNetwork } from '../src/Wallet';
import { OPEN_IN } from '../src/open-in';
import type { Runtime } from '../src/config';
const handoff = JSON.parse(
  readFileSync(new URL('../config/deployment-handoff.json', import.meta.url), 'utf8'),
);
const network = JSON.parse(
  readFileSync(new URL('../config/network-handoff.json', import.meta.url), 'utf8'),
);
const nft = handoff.contracts.find((c: { name: string }) => c.name === 'VeteransNFT')
  .address as Address;
const wallet = handoff.contracts.find((c: { name: string }) => c.name === 'VeteransRenderer')
  .address as Address;
test('PoW matches the exact packed Solidity preimage, including chain and wallet binding', () => {
  const nonce = 123456789012345678901234n;
  const independent = keccak256(
    concat([
      numberToHex(handoff.chainId, { size: 32 }),
      nft,
      wallet,
      numberToHex(nonce, { size: 32 }),
    ]),
  );
  assert.equal(hashFor(handoff.chainId, nft, wallet, nonce), independent);
  assert.notEqual(hashFor(handoff.chainId + 1, nft, wallet, nonce), independent);
  assert.notEqual(hashFor(handoff.chainId, nft, nft, nonce), independent);
});
test('PoW accepts strictly below target, never equal, and reports bounded work', () => {
  const hash = hashFor(handoff.chainId, nft, wallet, 12n);
  assert.equal(findProofSlice(handoff.chainId, nft, wallet, BigInt(hash), 12n, 1).nonce, undefined);
  assert.equal(findProofSlice(handoff.chainId, nft, wallet, BigInt(hash) + 1n, 12n, 1).nonce, 12n);
  assert.equal(findProofSlice(handoff.chainId, nft, wallet, 0n, 12n, 25).checked, 25);
});
test('runtime canonical Keccak matches both attested implementation ABIs', () => {
  for (const c of handoff.contracts) {
    const abi = JSON.parse(
      readFileSync(new URL(`../../docs/abi/${c.name}.json`, import.meta.url), 'utf8'),
    ) as Abi;
    assert.equal(canonicalAbiHash(abi), c.abiHash);
  }
});
test('amounts use decimals without floating-point loss and preserve tiny positive values', () => {
  assert.equal(amount(69000000000000000n), '0.069');
  assert.equal(amount(12345678901234567890123456n, 6), '12,345,678,901,234,567,890.12345');
  assert.equal(amount(1n), '<0.00001');
  assert.equal(amount(undefined), '—');
});
test('address input rejects zero or incomplete values and normalizes pasted whitespace', () => {
  assert.throws(() => validAddress('0x' + '0'.repeat(40)));
  assert.throws(() => validAddress('0x1234'));
  assert.equal(validAddress(` ${nft} `).toLowerCase(), nft.toLowerCase());
});
test('wallet rejection and RPC failure have actionable messages', () => {
  assert.match(errorText(new Error('User rejected request. 4001')), /declined/);
  assert.match(errorText(new Error('HTTP RPC timeout')), /Retry/);
});
test('unknown network requests add-chain with exact handoff params then switches again', async () => {
  const calls: { method: string; params?: unknown }[] = [];
  const provider = {
    request: async (args: { method: string; params?: unknown }) => {
      calls.push(args);
      if (calls.length === 1) throw { code: 4902, message: 'Unknown chain' };
      return null;
    },
  } as unknown as EIP1193Provider;
  const runtime = {
    deployment: { chainId: handoff.chainId, walletAddChain: network.walletAddChain },
  } as Pick<Runtime, 'deployment'>;
  await switchNetwork(provider, runtime);
  assert.deepEqual(
    calls.map((c) => c.method),
    ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain'],
  );
  assert.deepEqual(calls[1].params, [network.walletAddChain]);
  assert.deepEqual(calls[2].params, [{ chainId: numberToHex(handoff.chainId) }]);
});
test('user-rejected switching never triggers add-chain', async () => {
  let count = 0;
  const provider = {
    request: async () => {
      count++;
      throw { code: 4001, message: 'Rejected' };
    },
  } as unknown as EIP1193Provider;
  await assert.rejects(() =>
    switchNetwork(provider, {
      deployment: { chainId: handoff.chainId, walletAddChain: network.walletAddChain },
    } as Pick<Runtime, 'deployment'>),
  );
  assert.equal(count, 1);
});
test('all four mobile wallet links retain the complete static-hosting URL', () => {
  const url = 'https://gateway.example/ipfs/collection/#veterans';
  assert.equal(OPEN_IN.length, 4);
  for (const wallet of OPEN_IN) {
    const link = wallet.href(url);
    assert(link.startsWith('https://'));
    assert(decodeURIComponent(link).includes(url.replace(/^https?:\/\//, '')));
  }
  assert.match(OPEN_IN.find((w) => w.id === 'rabby')!.href(url), /_cmd=open-dapp&dapp=/);
});
