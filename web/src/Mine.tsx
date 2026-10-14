import { useEffect, useRef, useState } from 'react';
import type { Address, Hex } from 'viem';
import type { Runtime } from './config';
import { read, type GlobalState, type WalletState } from './chain';
import type { Transactions } from './transactions';
import { Icon, Metric, MinerArt, Notice } from './components';
import { amount, errorText } from './utils';

interface Props {
  r: Runtime;
  state?: GlobalState;
  wallet?: WalletState;
  address?: Address;
  ready: boolean;
  tx: Transactions;
  onNavigate: (page: string) => void;
}
export function Mine({ r, state, wallet, address, ready, tx, onNavigate }: Props) {
  const [mining, setMining] = useState(false),
    [auto, setAuto] = useState(false),
    [attempts, setAttempts] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [proof, setProof] = useState<{ nonce: bigint; hash: Hex }>(),
    [message, setMessage] = useState('');
  const worker = useRef<Worker | undefined>(undefined);
  const session = useRef(0);
  const retryAuto = useRef(false);
  const autoCurrent = useRef(auto);
  autoCurrent.current = auto;
  useEffect(() => {
    if (!auto) retryAuto.current = false;
  }, [auto]);
  const target = state?.target;
  const tokenReady = state?.decimals === 18 && state?.symbol === 'IMD';
  const allowed =
    ready &&
    state?.configured &&
    tokenReady &&
    !!wallet &&
    wallet.balance >= state.price &&
    wallet.allowance >= state.price &&
    state.minted < state.maxSupply;
  function stop(clear = false) {
    session.current++;
    worker.current?.terminate();
    worker.current = undefined;
    setMining(false);
    if (clear) {
      setProof(undefined);
      retryAuto.current = false;
    }
  }
  useEffect(() => {
    stop(true);
    setMessage('');
    return () => {
      session.current++;
      worker.current?.terminate();
    };
  }, [address, r.chain.id, target, ready]);
  useEffect(() => {
    if (!allowed) stop();
  }, [allowed]);
  function start() {
    if (!allowed || !state || !address) return;
    stop(true);
    setMessage('');
    setAttempts(0);
    setElapsed(0);
    setMining(true);
    const token = ++session.current;
    const w = new Worker(new URL('./miner.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const random = crypto.getRandomValues(new Uint32Array(2));
    const startNonce = (BigInt(random[0]) << 32n) | BigInt(random[1]);
    w.onerror = () => {
      stop();
      setMessage('The mining worker stopped. Start mining to try again.');
    };
    w.onmessage = async (e) => {
      if (token !== session.current) return;
      setAttempts(e.data.attempts);
      setElapsed(e.data.elapsed);
      if (e.data.type === 'found') {
        w.terminate();
        worker.current = undefined;
        try {
          const nonce = BigInt(e.data.nonce);
          const used = await read<boolean>(r, 'VeteransNFT', r.nft, 'nonceUsed', [address, nonce]);
          if (token !== session.current) return;
          if (used) {
            setMining(false);
            setMessage('That nonce was already used. Start again.');
            return;
          }
          setProof({ nonce, hash: e.data.hash });
          setMining(false);
          setMessage('Proof found. Review the mint to claim your Veteran.');
        } catch (error) {
          if (token === session.current) {
            setMining(false);
            setMessage(errorText(error));
          }
        }
      }
    };
    w.postMessage({
      chainId: r.chain.id,
      nft: r.nft,
      wallet: address,
      target: state.target.toString(),
      start: startNonce.toString(),
    });
  }
  useEffect(() => {
    if (retryAuto.current && allowed && !tx.pending) {
      retryAuto.current = false;
      start();
    }
  }, [allowed, tx.pending]);
  function mint() {
    if (!proof || !state) return;
    tx.propose({
      key: 'mint',
      label: 'Mint Veteran',
      description: `Mint one sequential Veteran for ${amount(state.price, state.decimals)} ${state.symbol}, plus the network fee. Your winning proof is bound to this wallet. Rarity is visual only.`,
      address: r.nft,
      abi: 'VeteransNFT',
      functionName: 'mint',
      args: [proof.nonce],
      after: () => {
        setProof(undefined);
        if (autoCurrent.current) retryAuto.current = true;
      },
    });
  }
  const needsApproval =
    ready &&
    state?.configured &&
    tokenReady &&
    state.minted < state.maxSupply &&
    wallet &&
    wallet.allowance < state.price;
  const soldOut = state && state.minted >= state.maxSupply;
  const epochTotal = state
    ? state.epoch === state.epochs - 1n
      ? state.maxSupply - state.epoch * state.epochSize
      : state.epochSize
    : 333n;
  const epochDone = state ? epochTotal - state.remaining : 0n;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Mine your <span>legacy.</span>
          </h1>
          <p>Proof-of-work miners. Rewards that grow with wallet age.</p>
        </div>
        <div className="network-tag">
          <span className="status-dot" />
          {r.chain.name}
        </div>
      </div>
      <div className="mine-layout">
        <section className="mine-console" aria-labelledby="mining-title">
          <div className="section-head">
            <h2 id="mining-title">
              <Icon /> Mining console
            </h2>
            <span className="status-text">
              {mining
                ? 'Mining locally'
                : proof
                  ? 'Proof found'
                  : state?.configured
                    ? 'Ready to mine'
                    : state
                      ? 'Awaiting setup'
                      : 'Reading chain…'}
            </span>
          </div>
          <div className="console-metrics">
            <Metric
              label="Mint price"
              value={`${state ? amount(state.price, state.decimals) : '0.069'} IMD`}
            />
            <Metric
              label="Epoch"
              value={state ? `${Number(state.epoch) + 1} / ${state.epochs}` : '—'}
            />
            <Metric label="Difficulty" value={state ? `${state.difficulty} bits` : '—'} />
          </div>
          <div className="console-output" aria-label="Mining activity">
            <div>
              <span className="terminal-prefix">&gt;</span>
              <span>
                {mining
                  ? 'Searching for a wallet-bound proof'
                  : proof
                    ? 'Valid proof found'
                    : soldOut
                      ? 'Collection fully mined'
                      : 'Worker idle'}
              </span>
              <span className="cursor" aria-hidden="true" />
            </div>
            <div className="hash-metrics">
              <span>{attempts.toLocaleString()} hashes</span>
              <span>
                {elapsed ? Math.round(attempts / (elapsed / 1000)).toLocaleString() : 0} H/s
              </span>
              <span>{Math.floor(elapsed / 1000)}s</span>
            </div>
            {proof && (
              <details>
                <summary>View winning proof</summary>
                <p className="wrap-code">Nonce {proof.nonce.toString()}</p>
                <p className="wrap-code">{proof.hash}</p>
              </details>
            )}
          </div>
          <div className="mining-actions">
            {needsApproval ? (
              <button
                className="button primary full"
                disabled={tx.pending || wallet.balance < state.price}
                onClick={() =>
                  tx.propose({
                    key: 'approve-mint',
                    label: 'Approve IMD',
                    description: `Allow the VETERANS NFT contract to spend exactly ${amount(state.price, state.decimals)} IMD for one mint. This approval does not mint an NFT.`,
                    address: state.imd,
                    abi: 'ERC20',
                    functionName: 'approve',
                    args: [r.nft, state.price],
                  })
                }
              >
                {tx.label('approve-mint', 'Approve 0.069 IMD')}
                <Icon name="arrow" />
              </button>
            ) : proof ? (
              <button
                className="button primary full"
                disabled={!allowed || tx.pending}
                onClick={mint}
              >
                {tx.label('mint', 'Mint Veteran · 0.069 IMD')}
                <Icon name="arrow" />
              </button>
            ) : mining ? (
              <button className="button primary full" onClick={() => stop()}>
                Pause mining
              </button>
            ) : (
              <button
                className="button primary full"
                disabled={!allowed || tx.pending || soldOut}
                onClick={start}
              >
                <Icon />
                {soldOut ? 'All Veterans mined' : 'Start mining'}
                <Icon name="arrow" />
              </button>
            )}
            <label className="check-label">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Auto-mine next proof <span className="muted small">Confirm each mint</span>
            </label>
            <p className="action-hint">
              {!state
                ? 'Loading the mining state…'
                : !state.configured
                  ? 'Minting opens after the owner configures IMD.'
                  : !tokenReady
                    ? 'The configured mint token must report IMD with 18 decimals. Mining is unavailable.'
                    : !address
                      ? 'Connect your wallet above to enter the mine.'
                      : !ready
                        ? 'Switch network or refresh the live state to continue.'
                        : wallet && wallet.balance < state.price
                          ? 'You need 0.069 IMD plus ETH for the network fee.'
                          : needsApproval
                            ? 'Approve one mint, then start your mining worker.'
                            : proof
                              ? 'Your proof is ready. Review and confirm the mint.'
                              : 'Mining uses your device’s CPU. Pause whenever you need.'}
            </p>
            {wallet && state && (
              <div className="wallet-balances">
                <span>
                  Balance: {amount(wallet.balance, state.decimals)} {state.symbol}
                </span>
                <span>{amount(wallet.nativeBalance)} ETH for fees</span>
              </div>
            )}
            {message && (
              <p className="form-message" role="status">
                {message}
              </p>
            )}
            {tx.status('approve-mint')}
            {tx.status('mint')}
          </div>
          <div className="epoch-progress">
            <div>
              <span>Epoch progress</span>
              <span className="mono">
                {epochDone.toString()} / {epochTotal.toString()}
              </span>
            </div>
            <progress
              max={Number(epochTotal)}
              value={Number(epochDone)}
              aria-label="Epoch mint progress"
            />
            <small>
              {state
                ? `${state.remaining} mints until ${state.epoch === state.epochs - 1n ? 'the collection is complete' : 'difficulty increases'}`
                : 'Reading epoch…'}{' '}
              · Price stays fixed
            </small>
          </div>
        </section>
        <aside className="mine-visual">
          <div className="art-window">
            <div className="art-title">
              <span>Veteran field portrait</span>
              <span>01 / 02</span>
            </div>
            <div className="portrait-pair">
              <MinerArt />
              <div className="gold-portrait">
                <MinerArt gold />
              </div>
            </div>
            <div className="art-caption">
              <span>Work makes a Veteran.</span>
              <Icon size={28} />
            </div>
          </div>
          <div className="art-bottom">
            <p>3,333 miners. No utility tiers.</p>
            <span className="muted small">Illustrative portraits · Traits reveal at mint</span>
            <button className="text-button" onClick={() => onNavigate('gallery')}>
              Explore the gallery <Icon name="arrow" />
            </button>
          </div>
        </aside>
      </div>
      <div className="stats-strip">
        <Metric
          label="Veterans mined"
          value={
            state ? `${state.minted.toLocaleString()} / ${state.maxSupply.toLocaleString()}` : '—'
          }
        />
        <Metric label="Veterans staked" value={state?.totalStaked.toLocaleString() ?? '—'} />
        <Metric
          label="Staking IMD distributed"
          value={amount(state?.imdDistributed, state?.decimals)}
          detail="Allocated rewards, including unclaimed"
        />
        <Metric
          label="ETH in claim pool"
          value={amount(state?.ethBalance)}
          detail="Live pool balance"
        />
      </div>
      <section className="age-section">
        <div>
          <h2>Time in the mine matters.</h2>
          <p className="muted">
            Your first mint or stake starts the clock. Keep staking to earn a larger weighted share.
          </p>
          <button className="text-button" onClick={() => onNavigate('staking')}>
            View staking dashboard <Icon name="arrow" />
          </button>
        </div>
        <div className="age-tiers">
          {[
            ['0–7 days', '1.0×'],
            ['8–30 days', '1.5×'],
            ['31–90 days', '2.0×'],
            ['91–180 days', '2.5×'],
            ['181–359 days', '4.0×'],
            ['360+ days', '8.0×'],
          ].map(([days, multi], i) => (
            <div key={days} className={i === 5 ? 'legendary' : ''}>
              <strong>{multi}</strong>
              <span>{days}</span>
              <div className="age-bar" style={{ height: `${12 + i * 7}px` }} />
            </div>
          ))}
        </div>
      </section>
      <details className="info-disclosure">
        <summary>How mining and rewards work</summary>
        <div className="details-body">
          <p>
            Every mint costs 0.069 IMD: 65% goes to staking rewards, 20% to the claim pool, 10% to
            treasury, and 5% to burn. The claim pool holds its mint share in IMD; it does not
            automatically convert it into ETH.
          </p>
          <p>
            ETH royalties pay stakers and treasury. The 6.9% royalty is configured on the NFT, while
            enforcement depends on the owner’s transfer-validator policy. This interface does not
            certify marketplace enforcement.
          </p>
          <p>
            Epochs 1–9 contain 333 mints each. Epoch 10 contains 336, reaching the deployed cap of
            3,333. Multipliers refresh on stake, unstake, staking claim, or an explicit refresh.
          </p>
          <Notice>
            Mining finds a proof locally. A proof does not reserve supply, and a new epoch can
            invalidate it before confirmation.
          </Notice>
          <p className="small muted">
            No price feed is configured. All values are shown in token units; USD context is
            unavailable.
          </p>
        </div>
      </details>
    </>
  );
}
