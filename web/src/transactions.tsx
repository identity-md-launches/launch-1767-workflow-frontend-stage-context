import { useEffect, useRef, useState } from 'react';
import { useConnection } from 'wagmi';
import {
  createWalletClient,
  custom,
  formatEther,
  type Address,
  type Hash,
} from 'viem';
import type { Runtime } from './config';
import { AddressLink, Modal, Notice } from './components';
import { amount, errorText } from './utils';
import { getConnectorProvider } from './wallet-provider';
export interface Action {
  key: string;
  label: string;
  description: string;
  address: Address;
  abi: string;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  irreversible?: boolean;
  after?: () => void;
}
export interface TxState {
  phase: 'simulating' | 'signature' | 'confirming' | 'unconfirmed' | 'success' | 'error';
  message: string;
  hash?: Hash;
}
export function useTransactions(r: Runtime, ready: boolean, refresh: () => Promise<unknown>) {
  const connection = useConnection();
  const live = useRef(connection);
  live.current = connection;
  const [intent, setIntent] = useState<Action>(),
    [review, setReview] = useState<{ fee?: bigint; error?: string; ready: boolean }>({
      ready: false,
    }),
    [states, setStates] = useState<Record<string, TxState>>({}),
    [accepted, setAccepted] = useState(false);
  const lock = useRef(false);
  const pending = Object.values(states).some((s) =>
    ['simulating', 'signature', 'confirming', 'unconfirmed'].includes(s.phase),
  );
  const outstanding = useRef<
    { action: Action; account: Address; hash: Hash; replaced: boolean } | undefined
  >(undefined);
  const context = `${connection.address}:${connection.chainId}:${connection.connector?.uid}:${connection.status}`;
  const intentContext = useRef('');
  const request = (a: Action, account: Address) => ({
    address: a.address,
    abi: r.abis[a.abi],
    functionName: a.functionName,
    args: a.args || [],
    value: a.value,
    account,
  });
  function propose(action: Action) {
    if (!ready || lock.current || pending) return;
    intentContext.current = context;
    setAccepted(false);
    setReview({ ready: false });
    setIntent(action);
  }
  useEffect(() => {
    if (!intent) return;
    let active = true;
    const account = connection.address;
    if (!account || !ready || context !== intentContext.current) {
      setReview({
        ready: false,
        error: 'Wallet or network changed. Close this review and try again.',
      });
      return;
    }
    const args = request(intent, account);
    Promise.all([
      r.publicClient.simulateContract(args),
      r.publicClient.estimateContractGas(args),
      r.publicClient.getGasPrice(),
    ])
      .then(([, gas, price]) => {
        if (active) setReview({ ready: true, fee: gas * price });
      })
      .catch((e) => {
        if (active) setReview({ ready: false, error: errorText(e) });
      });
    return () => {
      active = false;
    };
    // An intent fixes the action and account; the latest state is re-simulated before signing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, context, ready]);
  async function complete(action: Action, account: Address, hash: Hash) {
    try {
      await refresh();
      setStates((s) => ({
        ...s,
        [action.key]: { phase: 'success', message: `${action.label} confirmed.`, hash },
      }));
      if (live.current.address === account && live.current.chainId === r.chain.id) action.after?.();
    } catch {
      setStates((s) => ({
        ...s,
        [action.key]: {
          phase: 'success',
          message: `${action.label} confirmed. Live balances could not refresh; use Refresh before another action.`,
          hash,
        },
      }));
    }
  }
  async function recheck() {
    const current = outstanding.current;
    if (!current) return;
    setStates((s) => ({
      ...s,
      [current.action.key]: {
        phase: 'confirming',
        message: 'Checking transaction confirmation…',
        hash: current.hash,
      },
    }));
    try {
      const receipt = await r.publicClient.getTransactionReceipt({ hash: current.hash });
      if (receipt.status === 'success' && !current.replaced)
        await complete(current.action, current.account, receipt.transactionHash);
      else
        setStates((s) => ({
          ...s,
          [current.action.key]: {
            phase: 'error',
            message: current.replaced
              ? 'The wallet replaced or cancelled this action. Review the explorer before trying again.'
              : 'The transaction reverted on chain. Refresh before trying again.',
            hash: receipt.transactionHash,
          },
        }));
      outstanding.current = undefined;
      lock.current = false;
    } catch {
      setStates((s) => ({
        ...s,
        [current.action.key]: {
          phase: 'unconfirmed',
          message:
            'Confirmation is not available yet. Check again or inspect the transaction in the explorer.',
          hash: current.hash,
        },
      }));
    }
  }
  async function confirm() {
    if (!intent || !review.ready || !ready || lock.current) return;
    const action = intent,
      original = live.current;
    if (
      !original.address ||
      original.status !== 'connected' ||
      !original.connector ||
      original.chainId !== r.chain.id ||
      intentContext.current !== context
    )
      return;
    lock.current = true;
    setIntent(undefined);
    const update = (value: TxState) => setStates((s) => ({ ...s, [action.key]: value }));
    update({ phase: 'simulating', message: 'Checking the current contract state…' });
    try {
      const provider = await getConnectorProvider(original.connector);
      if (Number(await provider.request({ method: 'eth_chainId' })) !== r.chain.id)
        throw new Error('Switch to the configured network before signing.');
      const args = request(action, original.address);
      const { request: simulated } = await r.publicClient.simulateContract(args);
      if (
        live.current.address !== original.address ||
        live.current.chainId !== original.chainId ||
        live.current.connector !== original.connector ||
        live.current.status !== 'connected'
      )
        throw new Error('Wallet changed. Review the action again.');
      update({ phase: 'signature', message: 'Confirm this action in your wallet.' });
      const wallet = createWalletClient({
        account: original.address,
        chain: r.chain,
        transport: custom(provider),
      });
      const hash = await wallet.writeContract({
        ...simulated,
        account: original.address,
        chain: r.chain,
      });
      outstanding.current = { action, account: original.address, hash, replaced: false };
      update({
        phase: 'confirming',
        message: 'Transaction submitted. Waiting for confirmation…',
        hash,
      });
      const receipt = await r.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180000,
        onReplaced: (replacement) => {
          outstanding.current = {
            action,
            account: original.address!,
            hash: replacement.transaction.hash,
            replaced: replacement.reason !== 'repriced',
          };
          update({
            phase: 'confirming',
            message: 'Following the replacement transaction…',
            hash: replacement.transaction.hash,
          });
        },
      });
      const replaced = outstanding.current?.replaced;
      outstanding.current = undefined;
      if (replaced)
        update({
          phase: 'error',
          message:
            'The wallet replaced or cancelled this action. Review the explorer before trying again.',
          hash: receipt.transactionHash,
        });
      else if (receipt.status !== 'success')
        update({
          phase: 'error',
          message: 'The transaction reverted on chain. Refresh before trying again.',
          hash: receipt.transactionHash,
        });
      else await complete(action, original.address, receipt.transactionHash);
    } catch (e) {
      if (outstanding.current)
        update({
          phase: 'unconfirmed',
          message:
            'Transaction submitted, but confirmation could not be established. Check its status before trying another action.',
          hash: outstanding.current.hash,
        });
      else update({ phase: 'error', message: errorText(e) });
    } finally {
      if (!outstanding.current) lock.current = false;
    }
  }
  function status(key: string) {
    const state = states[key];
    return (
      state && (
        <div className={`tx-status ${state.phase === 'error' ? 'error' : ''}`} role="status">
          <span>{state.message}</span>
          {state.hash && (
            <a
              href={`${r.deployment.network.explorer}/tx/${state.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          )}
          {state.phase === 'unconfirmed' && (
            <button className="button" onClick={() => void recheck()}>
              Check confirmation
            </button>
          )}
        </div>
      )
    );
  }
  function label(key: string, fallback: string) {
    const s = states[key];
    return s && ['simulating', 'signature', 'confirming', 'unconfirmed'].includes(s.phase)
      ? s.phase === 'signature'
        ? 'Confirm in wallet…'
        : s.phase === 'confirming'
          ? 'Confirming…'
          : s.phase === 'unconfirmed'
            ? 'Awaiting receipt…'
            : 'Checking…'
      : fallback;
  }
  const dialog = intent && (
    <Modal title={`Review: ${intent.label}`} onClose={() => setIntent(undefined)}>
      <p>{intent.description}</p>
      <AddressLink r={r} address={intent.address} label="Contract" />
      <p className="small muted">Network: {r.chain.name}</p>
      {intent.value !== undefined && <p>Send {formatEther(intent.value)} ETH</p>}
      <p className="small">
        Estimated network fee:{' '}
        {review.fee !== undefined ? `${amount(review.fee, 18, 7)} ETH` : 'Calculating…'}
      </p>
      <p className="small muted">The wallet shows the final fee. USD context is unavailable.</p>
      {intent.irreversible && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          I understand this action cannot be undone.
        </label>
      )}
      {review.error && <Notice tone="error">{review.error}</Notice>}
      <button
        className="button primary full"
        onClick={() => void confirm()}
        disabled={!review.ready || (intent.irreversible && !accepted)}
      >
        {review.error
          ? 'Simulation failed'
          : review.ready
            ? 'Confirm in wallet'
            : 'Simulating action…'}
      </button>
      <p className="small muted">No transaction is sent until you confirm in your wallet.</p>
    </Modal>
  );
  return { propose, pending, status, label, dialog, states };
}
export type Transactions = ReturnType<typeof useTransactions>;
