import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  TimeoutError,
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
    CreatorTokenTransferValidator__ListDoesNotExist:
      'This operator list does not exist. Check the list ID on the validator and try again.',
    CreatorTokenTransferValidator__CallerMustHaveElevatedPermissionsForSpecifiedNFT:
      'The validator requires the collection owner. Reconnect the owner’s wallet and try again.',
    CreatorTokenTransferValidator__InvalidTransferSecurityLevel:
      'This validator has no matching transfer ruleset. Inspect the validator before trying again.',
  };
  const base = error instanceof BaseError ? error : undefined;
  const revert = base?.walk((e) => e instanceof ContractFunctionRevertedError) as
    | ContractFunctionRevertedError
    | undefined;
  const name = revert?.data?.errorName;
  if (name && messages[name]) return messages[name];
  if (revert) {
    if (name)
      return `The contract rejected this action (${name}). Review its settings and try again.`;
    return revert.reason
      ? `The contract rejected this action: ${revert.reason}. Review its settings and try again.`
      : 'The contract rejected this action. Check your permissions, inputs and the current contract settings.';
  }
  // Full viem errors contain documentation URLs. "https://…" is not evidence
  // of an HTTP failure; inspect the cause and the short message instead.
  const raw =
    base?.shortMessage ||
    (error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : String(error));
  const network = base?.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError);
  if (/rejected|denied|4001/i.test(raw))
    return 'Request declined in your wallet. You can try again.';
  if (/insufficient funds/i.test(raw)) return 'Your wallet needs more ETH for the network fee.';
  if (/allowance/i.test(raw))
    return 'Token approval is insufficient. Refresh and approve the required amount.';
  if (
    network instanceof HttpRequestError ||
    network instanceof TimeoutError ||
    /failed to fetch|network.*(?:failed|unavailable|unreachable)|timeout|timed out|HTTP request|RPC.*(?:unavailable|failed|timeout)/i.test(raw)
  )
    return 'The network could not be reached. Retry, or connect a wallet for RPC fallback.';
  return raw.replace(/https?:\/\/\S+/g, '[link]').slice(0, 260);
}
export const isZero = (value?: string) => !value || /^0x0{40}$/i.test(value);
