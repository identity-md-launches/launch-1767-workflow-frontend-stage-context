import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { read } from './chain';
import { AddressLink, Notice } from './components';
import type { PageProps } from './Portfolio';
import { errorText, isZero, validAddress } from './utils';

type Policy = {
  disableAuthorizationMode: boolean;
  authorizersCannotSetWildcardOperators: boolean;
  transferSecurityLevel: number;
  listId: bigint;
  enableAccountFreezingMode: boolean;
  tokenType: number;
};
export function Setup({ r, state, address, ready, tx }: PageProps) {
  const owner = !!address && address.toLowerCase() === state?.owner.toLowerCase();
  const [imd, setImd] = useState(''),
    [weth, setWeth] = useState(''),
    [renderer, setRenderer] = useState(''),
    [validator, setValidator] = useState(''),
    [newOwner, setNewOwner] = useState(''),
    [list, setList] = useState(''),
    [level, setLevel] = useState('3'),
    [error, setError] = useState(''),
    [checking, setChecking] = useState(false);
  const policy = useQuery({
    queryKey: ['policy', state?.validator, state?.blockNumber.toString()],
    enabled: !!state && !isZero(state.validator),
    queryFn: () =>
      read<Policy>(r, 'TransferValidator', state!.validator, 'getCollectionSecurityPolicy', [
        r.nft,
      ]),
    retry: 0,
    staleTime: 30000,
  });
  const disabled = !owner || !ready || tx.pending || checking;
  async function contractInput(input: string, token?: 'IMD' | 'WETH') {
    const address = validAddress(input);
    const code = await r.publicClient.getBytecode({ address });
    if (!code || code === '0x')
      throw new Error('No contract code was found at that address. Check the address and network.');
    if (token) {
      const [symbol, decimals] = await Promise.all([
        read<string>(r, 'ERC20', address, 'symbol'),
        read<number>(r, 'ERC20', address, 'decimals'),
      ]);
      if (symbol !== token || decimals !== 18)
        throw new Error(
          `This setting requires ${token} with 18 decimals. The address reports ${symbol} with ${decimals} decimals.`,
        );
    }
    return address;
  }
  async function submit(
    key: string,
    label: string,
    input: string,
    fn: string,
    description: string,
    token?: 'IMD' | 'WETH',
  ) {
    setError('');
    setChecking(true);
    try {
      const value = await contractInput(input, token);
      tx.propose({
        key,
        label,
        description: `${description} Address: ${value}.`,
        address: r.nft,
        abi: 'VeteransNFT',
        functionName: fn,
        args: fn === 'configure' ? [value, state!.staking, state!.pool] : [value],
        irreversible: fn === 'configure' || fn === 'setWeth',
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setChecking(false);
    }
  }
  return (
    <section className="setup-section">
      <div className="page-heading">
        <div>
          <h1>Contract setup.</h1>
          <p>
            Live wiring and collection settings. Only the connected owner can configure the NFT.
          </p>
        </div>
      </div>
      {!state ? (
        <Notice>Reading setup status…</Notice>
      ) : (
        <>
          <div className="setup-status">
            <div>
              <span>Minting</span>
              <strong>{state.configured ? 'Configured' : 'Awaiting IMD setup'}</strong>
            </div>
            <div>
              <span>WETH royalties</span>
              <strong>{isZero(state.weth) ? 'Not configured' : 'Configured'}</strong>
            </div>
            <div>
              <span>Metadata</span>
              <strong>{state.frozen ? 'Permanently frozen' : 'Owner can update'}</strong>
            </div>
            <div>
              <span>Transfer policy</span>
              <strong>
                {policy.data
                  ? `Level ${policy.data.transferSecurityLevel} · list ${policy.data.listId}`
                  : 'Not verified'}
              </strong>
            </div>
          </div>
          <Notice tone="warning">
            The NFT’s 6.9% royalty setting does not establish enforcement. The owner can change the
            validator and its policy. Marketplace compliance has not been independently verified.
          </Notice>
          <div className="contract-list">
            {r.deployment.contracts.map((c) => (
              <AddressLink key={c.name} r={r} address={c.address} label={c.name} />
            ))}
            <AddressLink r={r} address={state.staking} label="Staking · resolved from NFT" />
            <AddressLink r={r} address={state.pool} label="Claim pool · resolved from NFT" />
            <AddressLink r={r} address={state.owner} label="Collection owner" />
            {!isZero(state.imd) && <AddressLink r={r} address={state.imd} label="Configured IMD" />}
            {!isZero(state.weth) && (
              <AddressLink r={r} address={state.weth} label="Configured WETH" />
            )}
            {!isZero(state.validator) && (
              <AddressLink
                r={r}
                address={state.validator}
                label="Transfer validator · resolved from NFT"
              />
            )}
          </div>
          {!owner ? (
            <Notice>
              Connect the collection owner’s wallet to access setup controls. Visitors can review
              the configuration above.
            </Notice>
          ) : (
            <>
              <h2>Owner controls</h2>
              <p className="muted">
                Verify each address before signing. One-time settings cannot be changed later.
              </p>
              {error && <Notice tone="error">{error}</Notice>}
              <div className="setup-controls">
                <section>
                  <h3>1. Configure IMD</h3>
                  <p>
                    {state.configured
                      ? 'The mint currency is already set.'
                      : 'Set the IMD token once. Staking and pool addresses are read from the NFT and cannot be redirected.'}
                  </p>
                  <label>
                    IMD contract
                    <input
                      value={imd}
                      onChange={(e) => setImd(e.target.value)}
                      disabled={state.configured}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  {r.deployment.network.pairToken && (
                    <button
                      className="text-button"
                      disabled={state.configured}
                      onClick={() => setImd(r.deployment.network.pairToken!.address)}
                    >
                      Use IMD from network configuration
                    </button>
                  )}
                  <button
                    className="button"
                    disabled={disabled || state.configured}
                    onClick={() =>
                      void submit(
                        'configure',
                        'Configure IMD',
                        imd,
                        'configure',
                        'Permanently set the mint currency to this IMD contract. The deployed staking and pool siblings are unchanged.',
                        'IMD',
                      )
                    }
                  >
                    {tx.label('configure', checking ? 'Checking address…' : 'Review IMD setup')}
                  </button>
                  {tx.status('configure')}
                </section>
                <section>
                  <h3>2. Configure WETH</h3>
                  <p>
                    Set canonical wrapped ETH once, enabling the pool to unwrap WETH royalties.
                    Verify this address with the chain’s official documentation.
                  </p>
                  <label>
                    WETH contract
                    <input
                      value={weth}
                      onChange={(e) => setWeth(e.target.value)}
                      disabled={!isZero(state.weth)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  <button
                    className="button"
                    disabled={disabled || !isZero(state.weth)}
                    onClick={() =>
                      void submit(
                        'set-weth',
                        'Configure WETH',
                        weth,
                        'setWeth',
                        'Permanently set the WETH contract used to unwrap royalties. Symbol and decimals are checked, but they do not establish canonical identity.',
                        'WETH',
                      )
                    }
                  >
                    {tx.label('set-weth', 'Review WETH setup')}
                  </button>
                  {tx.status('set-weth')}
                </section>
                <section>
                  <h3>3. Set transfer policy</h3>
                  <p>
                    Configure the current Limit Break validator. Operator lists must contain
                    royalty-honouring marketplaces. Applying a list and setting the level are
                    separate transactions.
                  </p>
                  {policy.error && (
                    <Notice tone="error">
                      The validator’s policy interface could not be read. Policy writes are
                      disabled.
                    </Notice>
                  )}
                  <label>
                    Security level
                    <select value={level} onChange={(e) => setLevel(e.target.value)}>
                      <option value="3">3 · Allowlisted operators, direct transfers allowed</option>
                      <option value="4">4 · Allowlisted operators only</option>
                    </select>
                  </label>
                  <button
                    className="button"
                    disabled={disabled || !policy.data}
                    onClick={() =>
                      tx.propose({
                        key: 'policy',
                        label: 'Set transfer policy',
                        description: `Set level ${level} on the current validator. Disable authorization overrides and wildcard operators, and leave account freezing off. This can restrict NFT transfers. Review the applied marketplace list separately.`,
                        address: state.validator,
                        abi: 'TransferValidator',
                        functionName: 'setTransferSecurityLevelOfCollection',
                        args: [r.nft, Number(level), true, true, false],
                      })
                    }
                  >
                    {tx.label('policy', 'Review security level')}
                  </button>
                  {tx.status('policy')}
                  <label>
                    Existing operator list ID
                    <input
                      inputMode="numeric"
                      value={list}
                      onChange={(e) => setList(e.target.value)}
                    />
                  </label>
                  <button
                    className="button"
                    disabled={disabled || !policy.data}
                    onClick={() => {
                      try {
                        setError('');
                        if (!/^\d+$/.test(list) || BigInt(list) >= 1n << 120n)
                          throw new Error(
                            'Enter the existing list ID as a nonnegative integer within uint120.',
                          );
                        tx.propose({
                          key: 'apply-list',
                          label: 'Apply operator list',
                          description: `Apply operator list ${list} to VETERANS. Confirm its marketplace members on the validator before signing.`,
                          address: state.validator,
                          abi: 'TransferValidator',
                          functionName: 'applyListToCollection',
                          args: [r.nft, BigInt(list)],
                        });
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    {tx.label('apply-list', 'Review operator list')}
                  </button>
                  {tx.status('apply-list')}
                  <a
                    className="text-button"
                    href={`${r.deployment.network.explorer}/address/${state.validator}#readContract`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Inspect validator and lists ↗
                  </a>
                </section>
                <section>
                  <h3>4. Metadata</h3>
                  <p>
                    {state.frozen
                      ? 'The renderer is frozen forever.'
                      : 'The owner can replace the renderer until metadata is frozen. Freezing is irreversible.'}
                  </p>
                  <AddressLink r={r} address={state.renderer} label="Current renderer" />
                  <label>
                    New renderer contract
                    <input
                      value={renderer}
                      onChange={(e) => setRenderer(e.target.value)}
                      disabled={state.frozen}
                      spellCheck={false}
                    />
                  </label>
                  <button
                    className="button"
                    disabled={disabled || state.frozen}
                    onClick={() =>
                      void submit(
                        'renderer',
                        'Update renderer',
                        renderer,
                        'setRenderer',
                        'Replace the contract that renders every Veteran’s metadata and artwork',
                      )
                    }
                  >
                    {tx.label('renderer', 'Review renderer')}
                  </button>
                  {tx.status('renderer')}
                  <button
                    className="button"
                    disabled={disabled || state.frozen}
                    onClick={() =>
                      tx.propose({
                        key: 'freeze',
                        label: 'Freeze metadata forever',
                        description:
                          'Permanently prevent any future renderer replacement. This affects the entire collection and cannot be reversed.',
                        address: r.nft,
                        abi: 'VeteransNFT',
                        functionName: 'freezeMetadata',
                        irreversible: true,
                      })
                    }
                  >
                    {tx.label('freeze', 'Freeze metadata forever')}
                  </button>
                  {tx.status('freeze')}
                </section>
              </div>
              <details className="info-disclosure">
                <summary>Advanced owner settings</summary>
                <div className="details-body">
                  <label>
                    Replacement validator
                    <input
                      value={validator}
                      onChange={(e) => setValidator(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <button
                    className="button"
                    disabled={disabled}
                    onClick={() =>
                      void submit(
                        'validator',
                        'Replace transfer validator',
                        validator,
                        'setTransferValidator',
                        'Replace the transfer validator. The new validator’s security policy must be reviewed separately',
                      )
                    }
                  >
                    {tx.label('validator', 'Review replacement validator')}
                  </button>
                  {tx.status('validator')}
                  <p>
                    Automatic validator approval is{' '}
                    {state.autoValidatorApproval ? 'enabled' : 'disabled'}.
                  </p>
                  <div className="button-row">
                    {[true, false].map((enabled) => (
                      <button
                        key={String(enabled)}
                        className="button"
                        disabled={disabled || state.autoValidatorApproval === enabled}
                        onClick={() =>
                          tx.propose({
                            key: 'auto-approval',
                            label: enabled
                              ? 'Enable validator approval'
                              : 'Disable validator approval',
                            description: enabled
                              ? 'Automatically approve the transfer validator for holders’ unstaked tokens. This gives the validator transfer authority.'
                              : 'Remove automatic transfer approval for the validator.',
                            address: r.nft,
                            abi: 'VeteransNFT',
                            functionName: 'setAutomaticApprovalOfTransfersFromValidator',
                            args: [enabled],
                          })
                        }
                      >
                        {enabled ? 'Enable' : 'Disable'} automatic validator approval
                      </button>
                    ))}
                  </div>
                  {tx.status('auto-approval')}
                  <label>
                    New collection owner
                    <input
                      value={newOwner}
                      onChange={(e) => setNewOwner(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <button
                    className="button"
                    disabled={disabled}
                    onClick={() => {
                      try {
                        setError('');
                        const recipient = validAddress(newOwner);
                        tx.propose({
                          key: 'ownership',
                          label: 'Transfer ownership',
                          description: `Give collection configuration authority to ${recipient}. Your wallet will lose access to owner controls.`,
                          address: r.nft,
                          abi: 'VeteransNFT',
                          functionName: 'transferOwnership',
                          args: [recipient],
                          irreversible: true,
                        });
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    {tx.label('ownership', 'Review ownership transfer')}
                  </button>
                  {tx.status('ownership')}
                  <button
                    className="button danger"
                    disabled={disabled || !state.configured}
                    onClick={() =>
                      tx.propose({
                        key: 'renounce',
                        label: 'Renounce ownership forever',
                        description:
                          'Permanently remove the NFT’s owner. All remaining owner setup, renderer changes, and validator management become unavailable. Finish and verify configuration first.',
                        address: r.nft,
                        abi: 'VeteransNFT',
                        functionName: 'renounceOwnership',
                        irreversible: true,
                      })
                    }
                  >
                    {tx.label('renounce', 'Renounce ownership forever')}
                  </button>
                  {tx.status('renounce')}
                </div>
              </details>
            </>
          )}
          <details className="info-disclosure">
            <summary>Deployment provenance</summary>
            <div className="details-body">
              <p>Source commit</p>
              <code className="wrap-code">{r.deployment.sourceCommit}</code>
              <p>Attestation hash</p>
              <code className="wrap-code">{r.deployment.attestationHash}</code>
              <p>Runtime configuration</p>
              <a href="./imd-deployment.json">Download deployment manifest</a>
              <p className="small muted">
                ABI integrity and deployed contract code are checked before transaction controls are
                enabled. This does not certify marketplace policy or future RPC correctness.
              </p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
