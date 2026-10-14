import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { loadRuntime } from './config';
import './fonts.css';
import './styles.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="boot-error">
        <h1>The mine could not load.</h1>
        <p>Reload to recover the interface. Submitted transactions remain on chain.</p>
        <button className="button" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById('root')!);
root.render(
  <div className="boot-error">
    <h1>VETERANS</h1>
    <p>Verifying the deployment…</p>
  </div>,
);
loadRuntime()
  .then((runtime) => {
    const query = new QueryClient({
      defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
    });
    root.render(
      <ErrorBoundary>
        <WagmiProvider config={runtime.walletConfig}>
          <QueryClientProvider client={query}>
            <App r={runtime} />
          </QueryClientProvider>
        </WagmiProvider>
      </ErrorBoundary>,
    );
  })
  .catch((error) =>
    root.render(
      <div className="boot-error">
        <h1>Deployment unavailable.</h1>
        <p role="alert">{error.message}</p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload deployment
        </button>
      </div>,
    ),
  );
