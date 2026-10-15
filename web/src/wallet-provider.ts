import type { EIP1193Provider } from 'viem';

type ProviderConnector = { getProvider: () => unknown };

// Persisted wagmi connections contain connector metadata, not callable connectors.
// Treat both the connector and its returned provider as runtime input.
export function hasProviderGetter(value: unknown): value is ProviderConnector {
  return (
    !!value &&
    typeof value === 'object' &&
    'getProvider' in value &&
    typeof value.getProvider === 'function'
  );
}

export function isWalletProvider(value: unknown): value is EIP1193Provider {
  return (
    !!value &&
    typeof value === 'object' &&
    'request' in value &&
    typeof value.request === 'function'
  );
}

const pending = new WeakMap<ProviderConnector, Promise<EIP1193Provider>>();
export async function getConnectorProvider(connector: unknown): Promise<EIP1193Provider> {
  if (!hasProviderGetter(connector))
    throw new Error('Wallet connection is not ready. Disconnect and reconnect your wallet.');
  const existing = pending.get(connector);
  if (existing) return existing;
  const request = Promise.resolve()
    .then(() => connector.getProvider())
    .then((provider) => {
      if (!isWalletProvider(provider))
        throw new Error('Wallet provider is unavailable. Unlock your wallet and reconnect.');
      return provider;
    });
  pending.set(connector, request);
  try {
    return await request;
  } finally {
    pending.delete(connector);
  }
}
