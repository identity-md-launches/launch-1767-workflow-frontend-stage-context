import type { Address, Hex } from 'viem';
import type { Runtime } from './config';
import { isZero } from './utils';

export const read = <T>(
  r: Runtime,
  abi: string,
  address: Address,
  functionName: string,
  args: readonly unknown[] = [],
  blockNumber?: bigint,
) =>
  r.publicClient.readContract({
    address,
    abi: r.abis[abi],
    functionName,
    args,
    blockNumber,
  }) as Promise<T>;
export async function verifyDeployment(r: Runtime) {
  if ((await r.publicClient.getChainId()) !== r.deployment.chainId)
    throw new Error('RPC chain ID does not match the deployment. Transactions are disabled.');
  for (const c of r.deployment.contracts) {
    const code = await r.publicClient.getBytecode({ address: c.address });
    if (!code || code === '0x')
      throw new Error(`No deployed code at ${c.name}. Transactions are disabled.`);
  }
  const [staking, pool] = await Promise.all([
    read<Address>(r, 'VeteransNFT', r.nft, 'staking'),
    read<Address>(r, 'VeteransNFT', r.nft, 'claimPool'),
  ]);
  for (const [name, address] of [
    ['VeteransStaking', staking],
    ['VeteransClaimPool', pool],
  ] as const) {
    const code = await r.publicClient.getBytecode({ address });
    if (
      !code ||
      code === '0x' ||
      (await read<Address>(r, name, address, 'nft')).toLowerCase() !== r.nft.toLowerCase()
    )
      throw new Error('The sibling contract wiring could not be verified.');
  }
  if (
    (await read<Address>(r, 'VeteransClaimPool', pool, 'staking')).toLowerCase() !==
    staking.toLowerCase()
  )
    throw new Error('The claim pool staking address does not match.');
  return { staking, pool };
}
export async function readGlobal(
  r: Runtime,
  siblings: Awaited<ReturnType<typeof verifyDeployment>>,
) {
  const blockNumber = await r.publicClient.getBlockNumber({ cacheTime: 0 });
  const n = <T>(fn: string) => read<T>(r, 'VeteransNFT', r.nft, fn, [], blockNumber);
  const s = <T>(fn: string) => read<T>(r, 'VeteransStaking', siblings.staking, fn, [], blockNumber);
  const p = <T>(fn: string) => read<T>(r, 'VeteransClaimPool', siblings.pool, fn, [], blockNumber);
  const [
    minted,
    maxSupply,
    epoch,
    epochSize,
    epochs,
    difficulty,
    target,
    remaining,
    price,
    configured,
    imd,
    weth,
    owner,
    renderer,
    frozen,
    validator,
    totalStaked,
    totalWeight,
    imdRewards,
    ethReceived,
    ethToStakers,
    poolImd,
    treasuryOwed,
    imdOwed,
    ethBalance,
    carriedImd,
    autoValidatorApproval,
  ] = await Promise.all([
    n<bigint>('totalMinted'),
    n<bigint>('MAX_SUPPLY'),
    n<bigint>('currentEpoch'),
    n<bigint>('EPOCH_SIZE'),
    n<bigint>('EPOCH_COUNT'),
    n<bigint>('difficulty'),
    n<bigint>('target'),
    n<bigint>('mintsRemainingInEpoch'),
    n<bigint>('mintPrice'),
    n<boolean>('isConfigured'),
    n<Address>('imd'),
    n<Address>('weth'),
    n<Address>('owner'),
    n<Address>('renderer'),
    n<boolean>('metadataFrozen'),
    n<Address>('getTransferValidator'),
    s<bigint>('totalStaked'),
    s<bigint>('totalWeight'),
    s<bigint>('totalRewardsReceived'),
    p<bigint>('totalEthReceived'),
    p<bigint>('totalEthToStakers'),
    p<bigint>('totalImdReceived'),
    p<bigint>('treasuryOwed'),
    p<bigint>('imdOwed'),
    r.publicClient.getBalance({ address: siblings.pool, blockNumber }),
    s<bigint>('carryOver'),
    n<boolean>('autoApproveTransfersFromValidator'),
  ]);
  const token = configured
    ? await Promise.all([
        read<number>(r, 'ERC20', imd, 'decimals', [], blockNumber),
        read<string>(r, 'ERC20', imd, 'symbol', [], blockNumber),
      ])
    : undefined;
  const [poolImdBalance, wethBalance] = await Promise.all([
    configured ? read<bigint>(r, 'ERC20', imd, 'balanceOf', [siblings.pool], blockNumber) : 0n,
    !isZero(weth) ? read<bigint>(r, 'ERC20', weth, 'balanceOf', [siblings.pool], blockNumber) : 0n,
  ]);
  return {
    blockNumber,
    ...siblings,
    minted,
    maxSupply,
    epoch,
    epochSize,
    epochs,
    difficulty,
    target,
    remaining,
    price,
    configured,
    imd,
    weth,
    owner,
    renderer,
    frozen,
    validator,
    totalStaked,
    totalWeight,
    imdRewards,
    imdDistributed: imdRewards - carriedImd,
    autoValidatorApproval,
    ethReceived,
    ethToStakers,
    poolImd,
    treasuryOwed,
    imdOwed,
    ethBalance,
    poolImdBalance,
    wethBalance,
    decimals: token?.[0] ?? 18,
    symbol: token?.[1] ?? 'IMD',
  };
}
export type GlobalState = Awaited<ReturnType<typeof readGlobal>>;
export async function readWallet(r: Runtime, state: GlobalState, wallet: Address) {
  const n = <T>(fn: string, args: readonly unknown[] = [wallet]) =>
    read<T>(r, 'VeteransNFT', r.nft, fn, args);
  const s = <T>(fn: string) => read<T>(r, 'VeteransStaking', state.staking, fn, [wallet]);
  const p = <T>(fn: string) => read<T>(r, 'VeteransClaimPool', state.pool, fn, [wallet]);
  const [
    firstSeen,
    owned,
    age,
    multiplier,
    weight,
    staked,
    pendingImd,
    pendingPoolImd,
    pendingEth,
    stakingApproved,
    balance,
    allowance,
    nativeBalance,
  ] = await Promise.all([
    n<bigint>('firstSeen'),
    n<bigint>('balanceOf'),
    s<bigint>('walletAge'),
    s<bigint>('currentMultiplier'),
    s<bigint>('weightOf'),
    s<bigint[]>('stakedTokens'),
    s<bigint>('pendingReward'),
    p<bigint>('pendingImd'),
    p<bigint>('pendingEth'),
    n<boolean>('isApprovedForAll', [wallet, state.staking]),
    state.configured ? read<bigint>(r, 'ERC20', state.imd, 'balanceOf', [wallet]) : 0n,
    state.configured ? read<bigint>(r, 'ERC20', state.imd, 'allowance', [wallet, r.nft]) : 0n,
    r.publicClient.getBalance({ address: wallet }),
  ]);
  return {
    firstSeen,
    owned,
    age,
    multiplier,
    weight,
    staked,
    pendingImd,
    pendingPoolImd,
    pendingEth,
    stakingApproved,
    balance,
    allowance,
    nativeBalance,
  };
}
export type WalletState = Awaited<ReturnType<typeof readWallet>>;
export interface TokenRow {
  id: number;
  owner: Address;
  seed: Hex;
  staker?: Address;
}
export async function scanTokens(
  r: Runtime,
  state: GlobalState,
  progress: (count: number) => void,
  signal?: AbortSignal,
) {
  const rows: TokenRow[] = [];
  const blockNumber = await r.publicClient.getBlockNumber({ cacheTime: 0 });
  for (let start = 1; start <= Number(state.minted); start += 16) {
    if (signal?.aborted) throw new Error('Collection scan stopped.');
    const batch = Array.from(
      { length: Math.min(16, Number(state.minted) - start + 1) },
      (_, i) => start + i,
    );
    rows.push(
      ...(await Promise.all(
        batch.map(async (id) => {
          const [owner, seed] = await Promise.all([
            read<Address>(r, 'VeteransNFT', r.nft, 'ownerOf', [BigInt(id)], blockNumber),
            read<Hex>(r, 'VeteransNFT', r.nft, 'seedOf', [BigInt(id)], blockNumber),
          ]);
          const staker =
            owner.toLowerCase() === state.staking.toLowerCase()
              ? await read<Address>(
                  r,
                  'VeteransStaking',
                  state.staking,
                  'stakerOf',
                  [BigInt(id)],
                  blockNumber,
                )
              : undefined;
          return { id, owner, seed, staker };
        }),
      )),
    );
    progress(rows.length);
  }
  return rows;
}
export interface Metadata {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string | number }[];
}
export async function tokenMetadata(r: Runtime, id: number): Promise<Metadata> {
  const uri = await read<string>(r, 'VeteransNFT', r.nft, 'tokenURI', [BigInt(id)]);
  if (!uri.startsWith('data:application/json;base64,'))
    throw new Error(
      'The current renderer returned unsupported metadata. Open the token on the explorer.',
    );
  const data: Metadata = JSON.parse(atob(uri.split(',')[1]));
  if (
    !data.name ||
    !Array.isArray(data.attributes) ||
    !/^data:image\/(svg\+xml|png);base64,/.test(data.image)
  )
    throw new Error('The current renderer returned invalid metadata.');
  return data;
}
