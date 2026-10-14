import { createConfig } from 'wagmi';
import { injected, coinbaseWallet } from 'wagmi/connectors';
import {
  createPublicClient,
  custom,
  defineChain,
  fallback,
  http,
  keccak256,
  stringToHex,
  type Abi,
  type Address,
  type EIP1193Provider,
} from 'viem';

export interface Deployment {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    pairToken?: { address: Address; symbol: string; name: string; decimals: number };
  };
  walletAddChain?: {
    chainId: `0x${string}`;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
}
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const canonicalAbiHash = (abi: Abi) =>
  keccak256(stringToHex(JSON.stringify(canonical(abi)))).slice(2);
const safePath = (p: string) =>
  /^[\w./-]+$/.test(p) && !p.startsWith('/') && !p.split('/').includes('..');
export async function loadRuntime() {
  const response = await fetch(new URL('./imd-deployment.json', document.baseURI), {
    cache: 'no-cache',
  });
  if (!response.ok)
    throw new Error('Deployment configuration could not be loaded. Reload to try again.');
  const deployment: Deployment = await response.json();
  if (
    deployment.version !== 1 ||
    deployment.chainId !== deployment.network?.chainId ||
    !deployment.network.rpcUrls.length
  )
    throw new Error('Deployment network configuration is invalid.');
  const abis: Record<string, Abi> = {};
  for (const asset of deployment.assets.filter((a) => a.path.startsWith('abi/'))) {
    if (!safePath(asset.path)) throw new Error('Unsafe ABI path in deployment.');
    const r = await fetch(new URL(asset.path, document.baseURI));
    if (!r.ok) throw new Error(`Unable to load ${asset.path}. Reload to try again.`);
    const bytes = await r.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (digest !== asset.sha256) throw new Error(`Integrity check failed for ${asset.path}.`);
    const abi = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(abi)) throw new Error(`Invalid ABI: ${asset.path}`);
    abis[asset.path.replace('abi/', '').replace('.json', '')] = abi;
  }
  for (const c of deployment.contracts) {
    if (
      !safePath(c.abiPath) ||
      c.abiPath !== `abi/${c.name}.json` ||
      !abis[c.name] ||
      canonicalAbiHash(abis[c.name]) !== c.abiHash
    )
      throw new Error(`Attested ABI check failed for ${c.name}.`);
  }
  const nft = deployment.contracts.find((c) => c.name === 'VeteransNFT')?.address;
  if (!nft) throw new Error('The attested NFT contract is missing.');
  for (const name of [
    'VeteransNFT',
    'VeteransRenderer',
    'VeteransStaking',
    'VeteransClaimPool',
    'ERC20',
  ])
    if (!abis[name]) throw new Error(`Missing ${name} ABI.`);
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: deployment.network.explorer } },
    testnet: deployment.network.testnet,
  });
  let walletProvider: EIP1193Provider | undefined;
  const transport = fallback(
    [
      ...deployment.network.rpcUrls.map((url) =>
        http(url, { timeout: 10000, retryCount: 0, batch: { batchSize: 40, wait: 20 } }),
      ),
      custom(
        {
          async request(args) {
            if (!walletProvider)
              throw new Error('Public RPCs are unavailable. Connect a wallet or retry.');
            const id = await walletProvider.request({ method: 'eth_chainId' });
            if (Number(id) !== chain.id)
              throw new Error('Switch the wallet network to use wallet RPC fallback.');
            return walletProvider.request(args as Parameters<EIP1193Provider['request']>[0]);
          },
        },
        { retryCount: 0 },
      ),
    ],
    { retryCount: 0 },
  );
  const publicClient = createPublicClient({ chain, transport });
  const walletConfig = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [injected(), coinbaseWallet({ appName: 'VETERANS' })],
    transports: { [chain.id]: transport },
  });
  return {
    deployment,
    abis,
    nft,
    chain,
    publicClient,
    walletConfig,
    setWalletProvider: (provider?: EIP1193Provider) => {
      walletProvider = provider;
    },
  };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
