import { useEffect, useState } from 'react';
import { useConnect, useConnectors, useConnection, useDisconnect, type Connector } from 'wagmi';
import { numberToHex, type EIP1193Provider } from 'viem';
import type { Runtime } from './config';
import { AddressLink, Icon, Modal } from './components';
import { errorText, shortAddress } from './utils';
import { OPEN_IN, isMobileBrowser } from './open-in';

export async function switchNetwork(provider: EIP1193Provider, r: Pick<Runtime, 'deployment'>) {
  const chainId = numberToHex(r.deployment.chainId);
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      e.code !== 4902 &&
      e.data?.originalError?.code !== 4902 &&
      !/unknown chain|unrecognized chain|not added|not configured/i.test(e.message || '')
    )
      throw error;
    if (!r.deployment.walletAddChain)
      throw new Error('This network has no wallet setup parameters.');
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [r.deployment.walletAddChain],
    });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
}
export function Wallet({ r }: { r: Runtime }) {
  const { address, chainId, connector, isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending, variables } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState(''),
    [switching, setSwitching] = useState(false);
  const named = connectors.some((c) => c.type === 'injected' && c.id !== 'injected');
  const mobile =
    isMobileBrowser() && !named && !(window as unknown as { ethereum?: unknown }).ethereum;
  const listed = [
    ...connectors.filter((c) => c.type === 'injected'),
    ...connectors.filter((c) => c.type !== 'injected'),
  ].filter((c) => !(c.id === 'injected' && named) && (!mobile || c.type !== 'injected'));
  useEffect(() => {
    let current = true;
    if (connector)
      connector.getProvider().then((p) => {
        if (current) r.setWalletProvider(p as EIP1193Provider);
      });
    else r.setWalletProvider(undefined);
    return () => {
      current = false;
      r.setWalletProvider(undefined);
    };
  }, [connector, r]);
  async function switchChain(c = connector) {
    if (!c) return;
    setSwitching(true);
    setMessage('');
    try {
      await switchNetwork((await c.getProvider()) as EIP1193Provider, r);
      setOpen(false);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setSwitching(false);
    }
  }
  async function choose(c: Connector) {
    setMessage('');
    try {
      const result = await connect({ connector: c });
      if (result.chainId !== r.chain.id) await switchChain(c);
      else setOpen(false);
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  const wrong = isConnected && chainId !== r.chain.id;
  return (
    <>
      <button
        className={`wallet-button ${wrong ? 'wrong' : ''}`}
        onClick={() => {
          if (wrong) void switchChain();
          else setOpen(true);
        }}
        disabled={switching}
      >
        <Icon name="wallet" />
        {switching
          ? 'Switching…'
          : wrong
            ? `Switch to ${r.chain.name}`
            : address
              ? shortAddress(address)
              : 'Connect wallet'}
      </button>
      {message && !open && (
        <div className="wallet-note" role="status">
          {message}
          <button onClick={() => setMessage('')} aria-label="Dismiss wallet message">
            ×
          </button>
        </div>
      )}
      {open && (
        <Modal title={address ? 'Your wallet' : 'Connect a wallet'} onClose={() => setOpen(false)}>
          {address ? (
            <>
              <AddressLink address={address} r={r} />
              <p>{r.chain.name}</p>
              <button
                className="button full"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="muted">Choose a wallet to enter the mine.</p>
              <div className="wallet-options">
                {mobile &&
                  OPEN_IN.map((w) => (
                    <a className="wallet-row" key={w.id} href={w.href(location.href)}>
                      <img src={`./wallets/${w.id}.svg`} width="28" height="28" alt="" />
                      Open in {w.name}
                      <Icon name="arrow" />
                    </a>
                  ))}
                {listed.map((c) => (
                  <button
                    className="wallet-row"
                    key={c.uid}
                    onClick={() => void choose(c)}
                    disabled={isPending || switching}
                  >
                    {c.icon ? (
                      <img src={c.icon} alt="" width="28" height="28" />
                    ) : c.id === 'coinbaseWalletSDK' ? (
                      <img src="./wallets/coinbase.svg" alt="" width="28" height="28" />
                    ) : (
                      <Icon name="wallet" size={28} />
                    )}
                    <span>
                      {c.id === 'injected'
                        ? 'Browser wallet'
                        : c.id === 'coinbaseWalletSDK'
                          ? mobile
                            ? 'Coinbase Smart Wallet'
                            : 'Coinbase Wallet'
                          : c.name}
                      {isPending && variables?.connector === c ? ' · opening…' : ''}
                    </span>
                  </button>
                ))}
              </div>
              {!named && !mobile && (
                <p className="muted small">
                  No extension detected? Unlock your browser wallet, or create a Coinbase Smart
                  Wallet.
                </p>
              )}
            </>
          )}
          <p role="status" className="form-message">
            {message}
          </p>
        </Modal>
      )}
    </>
  );
}
