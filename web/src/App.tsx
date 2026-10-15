import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'wagmi';
import type { Runtime } from './config';
import { readGlobal, readWallet, scanTokens, verifyDeployment, type TokenRow } from './chain';
import { Icon, Notice } from './components';
import { Wallet } from './Wallet';
import { Mine } from './Mine';
import { Gallery } from './Gallery';
import { Claims, MyVeterans, Staking } from './Portfolio';
import { Setup } from './Setup';
import { useTransactions } from './transactions';
import { errorText } from './utils';
import { hasProviderGetter } from './wallet-provider';
const pages = [
  ['mine', 'Mine', 'pick'],
  ['gallery', 'Gallery', 'grid'],
  ['veterans', 'My Veterans', 'stack'],
  ['staking', 'Staking', 'chart'],
  ['claim', 'Claim', 'gift'],
] as const;
const currentPage = () =>
  ['mine', 'gallery', 'veterans', 'staking', 'claim', 'setup'].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : 'mine';
export function App({ r }: { r: Runtime }) {
  const { address, chainId, isConnected, status, connector } = useConnection();
  const [page, setPage] = useState(currentPage),
    [rows, setRows] = useState<TokenRow[]>(),
    [progress, setProgress] = useState(0),
    [scanning, setScanning] = useState(false),
    [scanError, setScanError] = useState('');
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const change = () => {
      setPage(currentPage());
      window.scrollTo({ top: 0 });
      document.getElementById('main')?.focus();
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const verify = useQuery({
    queryKey: ['verify', r.nft],
    queryFn: () => verifyDeployment(r),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
  const global = useQuery({
    queryKey: ['global', r.nft, verify.data],
    queryFn: () => readGlobal(r, verify.data!),
    enabled: !!verify.data,
    refetchInterval: isConnected ? 5000 : 30000,
    retry: 1,
  });
  const wallet = useQuery({
    queryKey: ['wallet', r.nft, address, global.data?.imd],
    queryFn: () => readWallet(r, global.data!, address!),
    enabled: !!address && !!global.data,
    refetchInterval: 5000,
    retry: 1,
  });
  const ready =
    status === 'connected' &&
    hasProviderGetter(connector) &&
    !!address &&
    chainId === r.chain.id &&
    !!global.data &&
    !!wallet.data &&
    !verify.isError &&
    !global.isError &&
    !wallet.isError;
  const refresh = useCallback(async () => {
    controller.current?.abort();
    setRows(undefined);
    const results = await Promise.all([global.refetch(), wallet.refetch()]);
    if (results.some((result) => result.isError))
      throw new Error(
        'Transaction confirmed, but balances could not refresh. Refresh the live state before another action.',
      );
  }, [global.refetch, wallet.refetch]);
  const tx = useTransactions(r, ready, refresh);
  async function loadRegistry() {
    if (!global.data || scanning) return;
    const control = new AbortController();
    controller.current = control;
    setProgress(0);
    setScanning(true);
    setScanError('');
    try {
      const result = await scanTokens(r, global.data, setProgress, control.signal);
      if (!control.signal.aborted) setRows(result);
    } catch (e) {
      setScanError(errorText(e));
    } finally {
      setScanning(false);
    }
  }
  useEffect(() => {
    controller.current?.abort();
    setRows(undefined);
  }, [address, global.data?.minted]);
  useEffect(() => () => controller.current?.abort(), []);
  const registry = {
    rows,
    loading: scanning,
    error: scanError,
    progress,
    load: () => void loadRegistry(),
    cancel: () => controller.current?.abort(),
    clear: () => setRows(undefined),
  };
  const props = { r, state: global.data, wallet: wallet.data, address, ready, tx, registry };
  const networkError = verify.error || global.error || (address ? wallet.error : undefined);
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById('main');
          main?.focus();
          main?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#mine" aria-label="VETERANS home">
            <span className="brand-mark">
              <Icon size={24} />
            </span>
            <span>
              VETERANS<span className="brand-sub">Proof of work. Proof of time.</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            {pages.map(([id, name, icon]) => (
              <a href={`#${id}`} key={id} aria-current={page === id ? 'page' : undefined}>
                <Icon name={icon} />
                {name}
              </a>
            ))}
          </nav>
          <Wallet r={r} />
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {networkError && (
          <Notice tone="error">
            <strong>Live data unavailable.</strong> {errorText(networkError)}{' '}
            <button
              className="button"
              onClick={() => {
                void verify.refetch();
                void global.refetch();
                if (address) void wallet.refetch();
              }}
            >
              Retry connection
            </button>
          </Notice>
        )}
        {isConnected && chainId !== r.chain.id && (
          <Notice tone="warning">
            Your wallet is on another network. Use “Switch to {r.chain.name}” above to enable
            actions.
          </Notice>
        )}
        {page === 'mine' ? (
          <Mine
            {...props}
            onNavigate={(next) => {
              location.hash = next;
            }}
          />
        ) : page === 'gallery' ? (
          <Gallery {...props} />
        ) : page === 'veterans' ? (
          <MyVeterans {...props} />
        ) : page === 'staking' ? (
          <Staking {...props} />
        ) : page === 'claim' ? (
          <Claims {...props} />
        ) : (
          <Setup {...props} />
        )}
        <div className="live-state">
          <span className={`status-dot ${networkError ? 'offline' : ''}`} />
          {networkError
            ? 'Read failed; actions paused'
            : global.data
              ? `Live state · block ${global.data.blockNumber.toLocaleString()}`
              : 'Verifying deployment…'}
          <button
            className="text-button"
            onClick={() => {
              void verify.refetch();
              void global.refetch();
              if (address) void wallet.refetch();
            }}
            disabled={global.isFetching}
          >
            Refresh
          </button>
        </div>
      </main>
      <footer className="site-footer">
        <div>
          <a className="footer-brand" href="#mine">
            VETERANS
          </a>
          <span>Earned by work. Weighted by time.</span>
        </div>
        <div>
          <a href="#setup">Contracts & setup</a>
          <a
            href={`${r.deployment.network.explorer}/address/${r.nft}`}
            target="_blank"
            rel="noreferrer"
          >
            View collection ↗
          </a>
          <a href="./imd-deployment.json">Deployment</a>
        </div>
      </footer>
      {tx.dialog}
    </>
  );
}
