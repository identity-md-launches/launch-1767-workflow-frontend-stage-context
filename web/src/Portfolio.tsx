import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseEther, type Address } from 'viem';
import type { Runtime } from './config';
import { read, type GlobalState, type WalletState } from './chain';
import type { Transactions } from './transactions';
import { AddressLink, Icon, Metric, Notice } from './components';
import { RegistryControl, TokenCard, type Registry } from './Gallery';
import { amount, errorText, isZero, shortAddress, validAddress } from './utils';

export interface PageProps {
  r: Runtime;
  state?: GlobalState;
  wallet?: WalletState;
  address?: Address;
  ready: boolean;
  tx: Transactions;
  registry: Registry;
}
export function WalletAge({ wallet }: { wallet?: WalletState }) {
  return (
    <div className="wallet-age">
      <Metric
        label="Your wallet age"
        value={wallet ? `${wallet.age / 86400n} days` : '—'}
        detail={
          wallet?.firstSeen === 0n
            ? 'Starts at your first mint or stake'
            : wallet
              ? 'Since first mint or stake'
              : 'Connect to see your age'
        }
      />
      <Metric
        label="Current multiplier"
        value={wallet ? `${Number(wallet.multiplier) / 10}×` : '—'}
        detail="Refresh to apply the current tier"
      />
      <Metric
        label="Recorded weight"
        value={wallet ? (Number(wallet.weight) / 10).toLocaleString() : '—'}
        detail={wallet ? `${wallet.staked.length} Veterans staked` : 'Age × staked Veterans'}
      />
    </div>
  );
}
export function MyVeterans({ r, state, wallet, address, ready, tx, registry }: PageProps) {
  const [tab, setTab] = useState('owned'),
    [selected, setSelected] = useState<number[]>([]),
    [recipient, setRecipient] = useState(''),
    [transferId, setTransferId] = useState(''),
    [error, setError] = useState('');
  useEffect(() => setSelected([]), [tab, address, registry.rows, wallet?.staked.join(',')]);
  const owned =
    registry.rows
      ?.filter((t) => t.owner.toLowerCase() === address?.toLowerCase())
      .map((t) => t.id) || [];
  const ids = tab === 'staked' ? wallet?.staked.map(Number) || [] : owned;
  const canAct = ready && !!state && !!wallet && !tx.pending && selected.length > 0;
  function stake() {
    if (!state || !wallet) return;
    if (tab === 'owned' && !wallet.stakingApproved)
      tx.propose({
        key: 'approve-stake',
        label: 'Approve staking',
        description:
          'Allow the constructor-deployed staking contract to move your Veterans. This collection-wide approval remains until you revoke it.',
        address: r.nft,
        abi: 'VeteransNFT',
        functionName: 'setApprovalForAll',
        args: [state.staking, true],
      });
    else
      tx.propose({
        key: tab === 'owned' ? 'stake' : 'unstake',
        label: tab === 'owned' ? 'Stake Veterans' : 'Unstake Veterans',
        description:
          tab === 'owned'
            ? `Stake ${selected.length} Veterans. There is no lock period. Rewards use your recorded wallet-age weight.`
            : `Return ${selected.length} Veterans to your wallet. Your accrued rewards remain claimable.`,
        address: state.staking,
        abi: 'VeteransStaking',
        functionName: tab === 'owned' ? 'stake' : 'unstake',
        args: [selected.map(BigInt)],
      });
  }
  function transfer() {
    try {
      setError('');
      const id = Number(transferId);
      if (!Number.isSafeInteger(id) || !owned.includes(id))
        throw new Error('Choose a token number from your loaded, unstaked Veterans.');
      const to = validAddress(recipient);
      if (to.toLowerCase() === state?.staking.toLowerCase())
        throw new Error('Use the staking controls to send a Veteran into staking.');
      tx.propose({
        key: 'transfer',
        label: 'Transfer Veteran',
        description: `Transfer Veteran #${id} to ${to}. The recipient becomes its owner. Transfer-validator policy may restrict this transfer.`,
        address: r.nft,
        abi: 'VeteransNFT',
        functionName: 'safeTransferFrom',
        args: [address, to, BigInt(id)],
        irreversible: true,
      });
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>My Veterans.</h1>
          <p>Put your miners to work. Stake and unstake at any time.</p>
        </div>
      </div>
      <WalletAge wallet={wallet} />
      {!address && <Notice>Connect your wallet above to load your Veterans and rewards.</Notice>}
      <div className="section-head portfolio-head">
        <div className="segmented" role="group" aria-label="Veteran ownership">
          <button aria-pressed={tab === 'owned'} onClick={() => setTab('owned')}>
            In wallet {wallet ? `(${wallet.owned})` : ''}
          </button>
          <button aria-pressed={tab === 'staked'} onClick={() => setTab('staked')}>
            Staked {wallet ? `(${wallet.staked.length})` : ''}
          </button>
        </div>
        <button
          className="button"
          disabled={!ready || tx.pending || !wallet?.staked.length}
          onClick={() =>
            state &&
            tx.propose({
              key: 'refresh-weight',
              label: 'Refresh multiplier',
              description:
                'Apply your current wallet-age multiplier to future rewards. Rewards already accrued keep their previous weighting.',
              address: state.staking,
              abi: 'VeteransStaking',
              functionName: 'refresh',
              args: [address],
            })
          }
        >
          {tx.label('refresh-weight', 'Refresh multiplier')}
        </button>
      </div>
      {tx.status('refresh-weight')}
      {tab === 'owned' && address && state && (
        <>
          <RegistryControl registry={registry} total={Number(state.minted)} />
          <p className="small muted">
            The collection index checks current ownership for every minted token. Your wallet’s NFT
            count is read separately.
          </p>
        </>
      )}
      {ids.length ? (
        <>
          <div className="selection-bar">
            <label className="check-label">
              <input
                type="checkbox"
                checked={selected.length === ids.length}
                onChange={(e) => setSelected(e.target.checked ? ids : [])}
              />
              Select all ({ids.length})
            </label>
            <span>{selected.length} selected</span>
            <button className="button primary" disabled={!canAct} onClick={stake}>
              {tab === 'owned' && !wallet?.stakingApproved
                ? tx.label('approve-stake', 'Approve staking')
                : tx.label(
                    tab === 'owned' ? 'stake' : 'unstake',
                    tab === 'owned' ? 'Stake selected' : 'Unstake selected',
                  )}
            </button>
          </div>
          <div className="gallery-grid">
            {ids.map((id) => (
              <TokenCard
                key={id}
                id={id}
                r={r}
                minted
                selected={selected.includes(id)}
                onSelect={() =>
                  setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
                }
              />
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Icon name="stack" size={36} />
          <h2>
            {tab === 'staked'
              ? 'No Veterans staked'
              : registry.rows
                ? 'No Veterans in this wallet'
                : 'Your miners belong here'}
          </h2>
          <p>
            {tab === 'staked'
              ? 'Select an owned Veteran to start earning weighted rewards.'
              : 'Mine a Veteran or load the collection index to find your tokens.'}
          </p>
          <a className="text-button" href="#mine">
            Go to the mine <Icon name="arrow" />
          </a>
        </div>
      )}
      {tx.status('approve-stake')}
      {tx.status('stake')}
      {tx.status('unstake')}
      {wallet?.stakingApproved && state && (
        <div className="approval-note">
          <p className="small muted">The staking contract has approval to move your Veterans.</p>
          <button
            className="button"
            disabled={!ready || tx.pending}
            onClick={() =>
              tx.propose({
                key: 'revoke-stake',
                label: 'Revoke staking approval',
                description:
                  'Remove collection-wide approval from the staking contract. Already-staked NFTs can still be unstaked.',
                address: r.nft,
                abi: 'VeteransNFT',
                functionName: 'setApprovalForAll',
                args: [state.staking, false],
              })
            }
          >
            {tx.label('revoke-stake', 'Revoke approval')}
          </button>
          {tx.status('revoke-stake')}
        </div>
      )}
      <details className="info-disclosure">
        <summary>Transfer an unstaked Veteran</summary>
        <div className="details-body">
          <p>
            Load your collection first. Transfers are subject to the NFT’s current validator policy.
          </p>
          <div className="form-grid">
            <label>
              Token number
              <input
                inputMode="numeric"
                value={transferId}
                onChange={(e) => setTransferId(e.target.value)}
              />
            </label>
            <label>
              Recipient address
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
          <button
            className="button"
            disabled={!ready || tx.pending || !registry.rows}
            onClick={transfer}
          >
            Review transfer
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {tx.status('transfer')}
        </div>
      </details>
    </>
  );
}
export function Claims({ state, wallet, address, ready, tx }: PageProps) {
  const [donation, setDonation] = useState(''),
    [error, setError] = useState('');
  const disabled = !ready || tx.pending;
  const claims = [
    {
      key: 'claim-staking',
      name: 'Staking rewards',
      unit: 'IMD',
      value: wallet?.pendingImd,
      description: 'Your share of the 65% mint allocation.',
      abi: 'VeteransStaking',
      fn: 'claim',
      contract: state?.staking,
    },
    {
      key: 'claim-imd',
      name: 'Claim pool · IMD',
      unit: 'IMD',
      value: wallet?.pendingPoolImd,
      description: 'Your share of mint fees and IMD royalties held in the pool.',
      abi: 'VeteransClaimPool',
      fn: 'claimImd',
      contract: state?.pool,
    },
    {
      key: 'claim-eth',
      name: 'Claim pool · ETH',
      unit: 'ETH',
      value: wallet?.pendingEth,
      description: 'Your share of ETH royalties and donations.',
      abi: 'VeteransClaimPool',
      fn: 'claimEth',
      contract: state?.pool,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Claim your rewards.</h1>
          <p>Rewards are earned by recorded staking weight. Claim when you’re ready.</p>
        </div>
      </div>
      {!address && <Notice>Connect your wallet above to see claimable balances.</Notice>}
      <div className="claims-grid">
        {claims.map((c) => (
          <section className="claim-panel" key={c.key}>
            <Icon name="gift" size={28} />
            <h2>{c.name}</h2>
            <div className="claim-value">
              {amount(c.value, c.unit === 'IMD' ? state?.decimals : 18)} <span>{c.unit}</span>
            </div>
            <p className="muted">{c.description}</p>
            <button
              className="button full"
              disabled={disabled || !c.value || !c.contract}
              onClick={() =>
                c.contract &&
                tx.propose({
                  key: c.key,
                  label: `Claim ${c.unit}`,
                  description: `Claim ${amount(c.value, c.unit === 'IMD' ? state?.decimals : 18)} ${c.unit} to your connected wallet. The final amount is calculated by the contract at confirmation.`,
                  address: c.contract,
                  abi: c.abi,
                  functionName: c.fn,
                })
              }
            >
              {tx.label(c.key, `Claim ${c.unit}`)}
            </button>
            {tx.status(c.key)}
          </section>
        ))}
      </div>
      <div className="claim-all">
        <p>Claim the pool’s IMD and ETH together in one transaction.</p>
        <button
          className="button primary"
          disabled={disabled || !state || !wallet || (!wallet.pendingPoolImd && !wallet.pendingEth)}
          onClick={() =>
            state &&
            tx.propose({
              key: 'claim-all',
              label: 'Claim both pool rewards',
              description:
                'Claim all available IMD and ETH from the claim pool. Staking IMD is claimed separately above.',
              address: state.pool,
              abi: 'VeteransClaimPool',
              functionName: 'claimAll',
            })
          }
        >
          {tx.label('claim-all', 'Claim both pool rewards')}
        </button>
        {tx.status('claim-all')}
      </div>
      <Notice>
        Mint fees enter the pool as IMD. They are not converted to ETH. ETH becomes claimable when
        royalties or donations reach the pool.
      </Notice>
      <p className="small muted">USD context is unavailable. Network fees are paid in ETH.</p>
      <details className="info-disclosure">
        <summary>Pool activity and maintenance</summary>
        <div className="details-body">
          <div className="stats-strip compact">
            <Metric label="ETH received, lifetime" value={amount(state?.ethReceived)} />
            <Metric label="ETH allocated to stakers" value={amount(state?.ethToStakers)} />
            <Metric
              label="IMD received, lifetime"
              value={amount(state?.poolImd, state?.decimals)}
            />
          </div>
          <p>
            Anyone can release unprocessed royalties. Each action is simulated before a signature.
          </p>
          <div className="maintenance-grid">
            <div>
              <h3>IMD royalties</h3>
              <p>
                {amount(state ? state.poolImdBalance - state.imdOwed : undefined, state?.decimals)}{' '}
                IMD waiting
              </p>
              <button
                className="button"
                disabled={disabled || !state?.configured || state.poolImdBalance <= state.imdOwed}
                onClick={() =>
                  state &&
                  tx.propose({
                    key: 'sync-imd',
                    label: 'Distribute IMD royalties',
                    description:
                      'Distribute unprocessed IMD as royalties: 600/690 to stakers and 90/690 to treasury.',
                    address: state.pool,
                    abi: 'VeteransClaimPool',
                    functionName: 'syncImd',
                  })
                }
              >
                {tx.label('sync-imd', 'Distribute IMD')}
              </button>
              {tx.status('sync-imd')}
            </div>
            <div>
              <h3>WETH royalties</h3>
              <p>
                {state && !isZero(state.weth)
                  ? `${amount(state.wethBalance)} WETH waiting`
                  : 'WETH is not configured yet.'}
              </p>
              <button
                className="button"
                disabled={disabled || !state || isZero(state.weth) || !state.wethBalance}
                onClick={() =>
                  state &&
                  tx.propose({
                    key: 'unwrap',
                    label: 'Unwrap WETH royalties',
                    description:
                      'Convert all WETH held by the pool into ETH, then apply the royalty split.',
                    address: state.pool,
                    abi: 'VeteransClaimPool',
                    functionName: 'unwrapWeth',
                  })
                }
              >
                {tx.label('unwrap', 'Unwrap WETH')}
              </button>
              {tx.status('unwrap')}
            </div>
            <div>
              <h3>Treasury payment</h3>
              <p>{amount(state?.treasuryOwed)} ETH waiting</p>
              <button
                className="button"
                disabled={disabled || !state?.treasuryOwed}
                onClick={() =>
                  state &&
                  tx.propose({
                    key: 'treasury',
                    label: 'Release treasury payment',
                    description:
                      'Retry the treasury’s previously unpaid royalty share. This sends to the contract’s fixed treasury beneficiary.',
                    address: state.pool,
                    abi: 'VeteransClaimPool',
                    functionName: 'payTreasury',
                  })
                }
              >
                {tx.label('treasury', 'Release payment')}
              </button>
              {tx.status('treasury')}
            </div>
          </div>
          <h3>Donate ETH to stakers</h3>
          <p>
            The donate function sends 100% to stakers. Donations cannot be withdrawn by the donor.
          </p>
          <label>
            Donation in ETH
            <input
              inputMode="decimal"
              value={donation}
              onChange={(e) => setDonation(e.target.value)}
            />
          </label>
          <button
            className="button"
            disabled={disabled || !state}
            onClick={() => {
              try {
                setError('');
                if (!/^\d+(\.\d{1,18})?$/.test(donation) || parseEther(donation) <= 0n)
                  throw new Error('Enter a positive ETH amount with at most 18 decimal places.');
                tx.propose({
                  key: 'donate',
                  label: 'Donate ETH',
                  description: `Donate ${donation} ETH entirely to the staking pool. This is not a deposit and cannot be reclaimed.`,
                  address: state!.pool,
                  abi: 'VeteransClaimPool',
                  functionName: 'donate',
                  value: parseEther(donation),
                  irreversible: true,
                });
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            {tx.label('donate', 'Review donation')}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {tx.status('donate')}
        </div>
      </details>
    </>
  );
}
export function Staking({ r, state, wallet, address, ready, tx, registry }: PageProps) {
  const [rank, setRank] = useState('age');
  const board = useQuery({
    queryKey: ['leaderboard', registry.rows, rank],
    enabled: !!registry.rows && !!state,
    queryFn: async () => {
      const unique = [
        ...new Set(
          registry.rows!.map((t) => t.staker).filter((a): a is Address => !!a && !isZero(a)),
        ),
      ];
      const rows = [];
      for (let i = 0; i < unique.length; i += 12) {
        rows.push(
          ...(await Promise.all(
            unique.slice(i, i + 12).map(async (account) => {
              const [age, weight, reward] = await Promise.all([
                read<bigint>(r, 'VeteransStaking', state!.staking, 'walletAge', [account]),
                read<bigint>(r, 'VeteransStaking', state!.staking, 'weightOf', [account]),
                read<bigint>(r, 'VeteransStaking', state!.staking, 'pendingReward', [account]),
              ]);
              return { account, age, weight, reward };
            }),
          )),
        );
      }
      return rows
        .sort((a, b) =>
          rank === 'age'
            ? Number(b.age - a.age)
            : b.reward > a.reward
              ? 1
              : b.reward < a.reward
                ? -1
                : 0,
        )
        .slice(0, 10);
    },
    staleTime: 30000,
    retry: 0,
  });
  const estimate =
    state && wallet && state.totalWeight > 0n
      ? (((state.price * 65n) / 100n) * wallet.weight) / state.totalWeight
      : 0n;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Time carries weight.</h1>
          <p>Stake Veterans to share in mint fees and royalties. No lock period.</p>
        </div>
        <a className="button primary" href="#veterans">
          Manage Veterans <Icon name="arrow" />
        </a>
      </div>
      <div className="stats-strip">
        <Metric label="Total staked" value={state?.totalStaked.toLocaleString() ?? '—'} />
        <Metric
          label="Network weight"
          value={state ? (Number(state.totalWeight) / 10).toLocaleString() : '—'}
        />
        <Metric label="Staking IMD received" value={amount(state?.imdRewards, state?.decimals)} />
        <Metric
          label="Your estimate / next mint"
          value={wallet ? `${amount(estimate, state?.decimals)} IMD` : '—'}
          detail="65% share, current recorded weights"
        />
      </div>
      <WalletAge wallet={wallet} />
      <div className="section-head">
        <p className="muted">Age tiers update on stake, unstake, staking claim, or refresh.</p>
        <button
          className="button"
          disabled={!ready || tx.pending || !wallet?.staked.length}
          onClick={() =>
            state &&
            tx.propose({
              key: 'refresh-weight',
              label: 'Refresh multiplier',
              description:
                'Apply your current age multiplier to your staked Veterans and the claim pool. This does not change previously accrued rewards.',
              address: state.staking,
              abi: 'VeteransStaking',
              functionName: 'refresh',
              args: [address],
            })
          }
        >
          {tx.label('refresh-weight', 'Refresh multiplier')}
        </button>
      </div>
      {tx.status('refresh-weight')}
      <Notice>
        Estimates assume unchanged staking weights and a future mint. Rewards depend on actual
        minting and royalties; there is no fixed yield or promised return.
      </Notice>
      <section className="leaderboard">
        <div className="section-head">
          <div>
            <h2>Veteran roll call</h2>
            <p className="muted">Top current stakers, from the loaded collection.</p>
          </div>
          <label>
            Rank by
            <select value={rank} onChange={(e) => setRank(e.target.value)}>
              <option value="age">Wallet age</option>
              <option value="rewards">Claimable staking IMD</option>
            </select>
          </label>
        </div>
        <RegistryControl registry={registry} total={Number(state?.minted ?? 0n)} />
        {board.isFetching ? (
          <p role="status">Reading staker ages and rewards…</p>
        ) : board.error ? (
          <Notice tone="error">
            {errorText(board.error)}
            <button onClick={() => void board.refetch()}>Retry leaderboard</button>
          </Notice>
        ) : board.data?.length ? (
          <ol className="leaderboard-list">
            {board.data.map((row, i) => (
              <li key={row.account}>
                <span className="rank-number">{i + 1}</span>
                <div>
                  <a
                    href={`${r.deployment.network.explorer}/address/${row.account}`}
                    target="_blank"
                    rel="noreferrer"
                    title={row.account}
                  >
                    {shortAddress(row.account)}
                  </a>
                  <span className="muted small">
                    {row.age / 86400n} days · {Number(row.weight) / 10} weight
                  </span>
                </div>
                <strong className="mono">{amount(row.reward, state?.decimals)} IMD</strong>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">
            <Icon name="chart" size={32} />
            <h3>{registry.rows ? 'No stakers in the collection yet' : 'Load the roll call'}</h3>
            <p>The leaderboard appears after reading the collection. No rankings are estimated.</p>
          </div>
        )}
      </section>
      <details className="info-disclosure">
        <summary>Wallet-age multipliers</summary>
        <div className="details-body">
          <dl className="trait-list">
            {[
              ['0–7 days', '1.0×'],
              ['8–30 days', '1.5×'],
              ['31–90 days', '2.0×'],
              ['91–180 days', '2.5×'],
              ['181–359 days', '4.0×'],
              ['360+ days', '8.0×'],
            ].map(([age, m]) => (
              <div key={age}>
                <dt>{age}</dt>
                <dd>{m}</dd>
              </div>
            ))}
          </dl>
          <p>
            Age counts from your first mint or stake in this collection, not the creation date of
            your wallet. Visual rarity never changes reward weight.
          </p>
          {address && <AddressLink address={address} r={r} label="Connected wallet" />}
        </div>
      </details>
    </>
  );
}
