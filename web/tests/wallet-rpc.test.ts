import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  encodeErrorResult,
  type Abi,
  type EIP1193Provider,
} from 'viem';
import {
  getConnectorProvider,
  hasProviderGetter,
  isWalletProvider,
} from '../src/wallet-provider';
import { rpcTransport } from '../src/rpc';
import { errorText } from '../src/utils';

test('serialized connectors, factories and malformed providers cannot reach getProvider/request', async () => {
  for (const value of [
    undefined,
    null,
    false,
    {},
    { id: 'injected', uid: 'persisted' },
    { getProvider: true },
    () => ({}),
  ]) {
    assert.equal(hasProviderGetter(value), false);
    await assert.rejects(getConnectorProvider(value), /Disconnect and reconnect/);
  }
  for (const value of [undefined, null, {}, { request: 'no' }]) {
    assert.equal(isWalletProvider(value), false);
    await assert.rejects(
      getConnectorProvider({ getProvider: () => value }),
      /provider is unavailable/,
    );
  }
});

test('concurrent provider lookups share initialization and failures are retryable', async () => {
  let calls = 0;
  const provider = { request: async () => '0x1237' };
  const connector = {
    async getProvider() {
      calls++;
      await delay(15);
      return provider;
    },
  };
  assert.deepEqual(
    await Promise.all([getConnectorProvider(connector), getConnectorProvider(connector)]),
    [provider, provider],
  );
  assert.equal(calls, 1);
  let reject = true;
  const flaky = {
    getProvider() {
      if (reject) throw new Error('Wallet locked');
      return provider;
    },
  };
  await assert.rejects(getConnectorProvider(flaky), /Wallet locked/);
  reject = false;
  assert.equal(await getConnectorProvider(flaky), provider);
});

test('viem documentation URLs never turn contract reverts or local errors into network failures', () => {
  const abi = JSON.parse(
    readFileSync(new URL('../config/transfer-validator.json', import.meta.url), 'utf8'),
  ) as Abi;
  const revert = new ContractFunctionRevertedError({
    abi,
    functionName: 'applyListToCollection',
    data: encodeErrorResult({
      abi,
      errorName: 'CreatorTokenTransferValidator__ListDoesNotExist',
    }),
  });
  const wrapped = new BaseError(revert.shortMessage, {
    cause: revert,
    docsPath: '/docs/contract/simulateContract',
  });
  assert.match(wrapped.message, /https:/);
  assert.match(errorText(wrapped), /operator list does not exist/);
  assert.doesNotMatch(
    errorText(new BaseError('Invalid input', { docsPath: '/docs' })),
    /network could not/,
  );
  assert.match(
    errorText(
      new ContractFunctionRevertedError({
        abi,
        functionName: 'applyListToCollection',
      }),
    ),
    /contract rejected/,
  );
  assert.match(errorText({ code: 4001, message: 'User rejected request' }), /declined/);
});

type Reply = {
  result?: unknown;
  error?: { code: number; message: string };
  status?: number;
};
async function endpoint(handler: (method: string, count: number) => Reply) {
  let count = 0;
  const methods: string[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    if (Array.isArray(data)) {
      res.writeHead(400);
      res.end('No batches');
      return;
    }
    methods.push(data.method);
    const { status = 200, ...reply } = handler(data.method, ++count);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: data.id, ...reply }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    methods,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test('public transport fails over on HTTP and rate-limit failures without requiring JSON-RPC batches', async () => {
  const primary = await endpoint(() => ({
    error: { code: -32005, message: 'Rate limit exceeded' },
  }));
  const secondary = await endpoint(() => ({ result: '0x1237' }));
  try {
    const client = createPublicClient({
      transport: rpcTransport([primary.url, secondary.url], 4663, () => undefined),
    });
    assert.equal(await client.getChainId(), 4663);
    assert.deepEqual(primary.methods, ['eth_chainId']);
    assert.deepEqual(secondary.methods, ['eth_chainId']);
  } finally {
    await primary.close();
    await secondary.close();
  }
});

test('a transient total public outage gets one bounded retry', async () => {
  const primary = await endpoint((_, count) =>
    count === 1 ? { status: 503 } : { result: '0x1237' },
  );
  const secondary = await endpoint(() => ({ status: 503 }));
  try {
    const client = createPublicClient({
      transport: rpcTransport([primary.url, secondary.url], 4663, () => undefined),
    });
    assert.equal(await client.getChainId(), 4663);
    assert.equal(primary.methods.length, 2);
    assert.equal(secondary.methods.length, 1);
  } finally {
    await primary.close();
    await secondary.close();
  }
});

test('contract reverts stop failover and are never retried on another provider', async () => {
  const primary = await endpoint(() => ({
    error: { code: 3, message: 'execution reverted' },
  }));
  const secondary = await endpoint(() => ({ result: '0x1' }));
  let walletCalls = 0;
  try {
    const client = createPublicClient({
      transport: rpcTransport([primary.url, secondary.url], 4663, () => {
        walletCalls++;
        return undefined;
      }),
    });
    await assert.rejects(
      client.request({
        method: 'eth_call',
        params: [{ data: '0x' }, 'latest'],
      }),
    );
    assert.equal(primary.methods.length, 1);
    assert.equal(secondary.methods.length, 0);
    assert.equal(walletCalls, 0);
  } finally {
    await primary.close();
    await secondary.close();
  }
});

test('wallet fallback uses only a current provider on the expected chain and clears on disconnect', async () => {
  const unavailable = await endpoint(() => ({ status: 503 }));
  const requests: string[] = [];
  let id = 1;
  let provider: EIP1193Provider | undefined = {
    request: async ({ method }: { method: string }) => {
      requests.push(method);
      return method === 'eth_chainId' ? `0x${id.toString(16)}` : '0x10';
    },
  } as EIP1193Provider;
  try {
    const client = createPublicClient({
      transport: rpcTransport([unavailable.url], 4663, () => provider),
    });
    await assert.rejects(client.getBlockNumber({ cacheTime: 0 }));
    assert(!requests.includes('eth_blockNumber'));
    id = 4663;
    assert.equal(await client.getBlockNumber({ cacheTime: 0 }), 16n);
    provider = undefined;
    const before = requests.length;
    await assert.rejects(client.getBlockNumber({ cacheTime: 0 }));
    assert.equal(requests.length, before);
  } finally {
    await unavailable.close();
  }
});

test('a provider replaced during the fallback chain check never receives the read', async () => {
  const unavailable = await endpoint(() => ({ status: 503 }));
  let provider: EIP1193Provider | undefined;
  const methods: string[] = [];
  provider = {
    request: async ({ method }: { method: string }) => {
      methods.push(method);
      provider = undefined;
      return '0x1237';
    },
  } as EIP1193Provider;
  try {
    const client = createPublicClient({
      transport: rpcTransport([unavailable.url], 4663, () => provider),
    });
    await assert.rejects(client.getBlockNumber({ cacheTime: 0 }));
    assert.deepEqual(methods, ['eth_chainId']);
  } finally {
    await unavailable.close();
  }
});
