import { toFunctionSelector, zeroAddress, type Address } from 'viem';
import type { Runtime } from './config';
import { read } from './chain';

export type Policy = {
  rulesetId: number;
  listId: number;
  customRuleset: Address;
  globalOptions: number;
  rulesetOptions: number;
  tokenType: number;
};

export async function readTransferPolicy(r: Runtime, validator: Address) {
  const code = await r.publicClient.getBytecode({ address: validator });
  // The old and modular validators share the read selector and six output words.
  // Check the write interface too, so a replacement cannot be silently misdecoded.
  for (const signature of [
    'setRulesetOfCollection(address,uint8,address,uint8,uint16)',
    'applyListToCollection(address,uint48)',
  ]) {
    if (!code?.includes(toFunctionSelector(signature).slice(2)))
      throw new Error(
        'This validator uses a different policy interface. Inspect its contract before changing transfer rules.',
      );
  }
  return read<Policy>(r, 'TransferValidator', validator, 'getCollectionSecurityPolicy', [
    r.nft,
  ]);
}

export function transferPolicyArgs(collection: Address, allowDirect: boolean) {
  // Limit Break modular validator, Constants.sol at 59adb8b36ab0256c7430b017b1c9f8b4841d6e1e:
  // ruleset 4 = whitelist; global flags 1 | 2 disable authorization/wildcards.
  // OTC flags 2 | 4 preserve direct transfers for delegated EOAs and smart wallets;
  // flag 1 restricts OTC too. Freezing and receiver restrictions stay off.
  // zeroAddress is the protocol-required "no custom ruleset" sentinel for a
  // managed ruleset, not a substitute owner, recipient or deployment address.
  return [collection, 4, zeroAddress, 3, allowDirect ? 6 : 1] as const;
}
