import {
  BaseError,
  ContractFunctionRevertedError,
  formatUnits,
  getAddress,
  isAddress,
  type Address,
} from 'viem';
export const shortAddress = (address: Address) =>
  `${getAddress(address).slice(0, 6)}…${getAddress(address).slice(-4)}`;
export function amount(value: bigint | undefined, decimals = 18, precision = 5) {
  if (value === undefined) return '—';
  const formatted = formatUnits(value, decimals);
  const [whole, fraction] = formatted.split('.');
  const head = BigInt(whole).toLocaleString('en-US');
  if (!fraction) return head;
  const cut = fraction.slice(0, precision).replace(/0+$/, '');
  if (value > 0n && whole === '0' && !cut) return `<0.${'0'.repeat(precision - 1)}1`;
  return cut ? `${head}.${cut}` : head;
}
export function validAddress(input: string): Address {
  const value = input.trim();
  if (!isAddress(value) || BigInt(value) === 0n)
    throw new Error('Enter a valid, nonzero contract address.');
  return getAddress(value);
}
export function errorText(error: unknown) {
  const messages: Record<string, string> = {
    NotConfigured: 'The owner has not finished setup. Check the contract setup section.',
    SoldOut: 'All Veterans have been mined. Browse the gallery or manage your stakes.',
    HashAboveTarget: 'Difficulty changed. Start mining again for the current target.',
    NonceAlreadyUsed: 'This proof has already been used. Start mining a new proof.',
    NotTokenOwner: 'Your wallet no longer owns this Veteran. Refresh the collection.',
    NotStaker: 'This Veteran is not staked by your wallet. Refresh your stakes.',
    NothingToSync: 'There are no new royalties to distribute. Refresh the pool.',
    NothingOwed: 'No treasury payment is waiting.',
    MetadataIsFrozen: 'Metadata is permanently frozen.',
    AlreadyConfigured: 'This setting has already been configured. Refresh the state.',
    EthTransferFailed: 'The receiving wallet rejected ETH. Check that it can receive ETH.',
    InvalidSibling: 'Contract wiring did not match the NFT. Reload the deployment.',
  };
  const base = error instanceof BaseError ? error : undefined;
  const revert = base?.walk((e) => e instanceof ContractFunctionRevertedError) as
    ContractFunctionRevertedError | undefined;
  const name = revert?.data?.errorName;
  if (name && messages[name]) return messages[name];
  const raw = error instanceof Error ? error.message : String(error);
  if (/rejected|denied|4001/i.test(raw))
    return 'Request declined in your wallet. You can try again.';
  if (/insufficient funds/i.test(raw)) return 'Your wallet needs more ETH for the network fee.';
  if (/allowance/i.test(raw))
    return 'Token approval is insufficient. Refresh and approve the required amount.';
  if (/fetch|network|timeout|HTTP|RPC/i.test(raw))
    return 'The network could not be reached. Retry, or connect a wallet for RPC fallback.';
  if (name) return `The contract rejected this action (${name}). Refresh the state and try again.`;
  return (base?.shortMessage || raw).replace(/https?:\/\/\S+/g, '[RPC]').slice(0, 260);
}
export const isZero = (value?: string) => !value || /^0x0{40}$/i.test(value);
