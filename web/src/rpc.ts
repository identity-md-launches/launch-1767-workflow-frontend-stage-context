import { custom, fallback, http, withTimeout, type EIP1193Provider } from 'viem';
import { isWalletProvider } from './wallet-provider';

export function rpcTransport(
  urls: readonly string[],
  chainId: number,
  getWalletProvider: () => EIP1193Provider | undefined,
) {
  // A burst of reads shares one in-flight chain check, without adding provider
  // listeners or caching a chain ID across a switch/disconnect.
  const checks = new WeakMap<EIP1193Provider, Promise<unknown>>();
  async function walletRequest(args: { method: string; params?: unknown }) {
    const provider = getWalletProvider();
    if (!isWalletProvider(provider))
      throw new Error('Public RPCs are unavailable. Connect a wallet or retry.');
    let check = checks.get(provider);
    if (!check) {
      check = withTimeout(() => provider.request({ method: 'eth_chainId' }), {
        timeout: 8000,
      });
      checks.set(provider, check);
      void check.finally(() => checks.delete(provider)).catch(() => {});
    }
    if (Number(await check) !== chainId)
      throw new Error('Switch the wallet to Robinhood Chain before retrying.');
    if (getWalletProvider() !== provider)
      throw new Error('Wallet changed. Refresh and try again.');
    return provider.request(args as Parameters<EIP1193Provider['request']>[0]);
  }
  return fallback(
    [
      ...urls.map((url) =>
        http(url, {
          // Single JSON-RPC requests also work on endpoints which reject batches,
          // particularly eth_call/eth_estimateGas during transaction review.
          batch: false,
          timeout: 4000,
          retryCount: 0,
        }),
      ),
      custom(
        {
          request: (args) => withTimeout(() => walletRequest(args), { timeout: 8000 }),
        },
        { retryCount: 0 },
      ),
    ],
    // Try both public endpoints before the selected wallet; retry one complete
    // pass for transient outages. viem stops immediately on contract reverts.
    { retryCount: 1, retryDelay: 250 },
  );
}
