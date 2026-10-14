import { findProofSlice } from './pow';
import type { Address } from 'viem';
let generation = 0;
self.onmessage = async (
  event: MessageEvent<{
    chainId: number;
    nft: Address;
    wallet: Address;
    target: string;
    start: string;
  }>,
) => {
  const current = ++generation;
  const { chainId, nft, wallet } = event.data;
  let nonce = BigInt(event.data.start),
    attempts = 0,
    last = performance.now();
  const started = last;
  while (current === generation) {
    const found = findProofSlice(chainId, nft, wallet, BigInt(event.data.target), nonce, 1024);
    attempts += found.checked;
    if (found.nonce !== undefined) {
      self.postMessage({
        type: 'found',
        nonce: found.nonce.toString(),
        hash: found.hash,
        attempts,
        elapsed: performance.now() - started,
      });
      return;
    }
    nonce += 1024n;
    if (performance.now() - last > 500) {
      self.postMessage({ type: 'progress', attempts, elapsed: performance.now() - started });
      last = performance.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};
