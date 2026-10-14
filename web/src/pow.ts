import { encodePacked, keccak256, type Address } from 'viem';
export const hashFor = (chainId: number, nft: Address, wallet: Address, nonce: bigint) =>
  keccak256(
    encodePacked(
      ['uint256', 'address', 'address', 'uint256'],
      [BigInt(chainId), nft, wallet, nonce],
    ),
  );
export function findProofSlice(
  chainId: number,
  nft: Address,
  wallet: Address,
  target: bigint,
  start: bigint,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    const nonce = start + BigInt(i);
    const hash = hashFor(chainId, nft, wallet, nonce);
    if (BigInt(hash) < target) return { nonce, hash, checked: i + 1 };
  }
  return { checked: count };
}
