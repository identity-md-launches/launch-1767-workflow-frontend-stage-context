// Synthetic chain and wallet fixtures, used only by browser tests. Never imported by the application.
import { readFile } from 'node:fs/promises';
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  keccak256,
  numberToHex,
  stringToHex,
  toFunctionSelector,
  zeroAddress,
} from 'viem';
export async function mockChain(manifest) {
  const abis = {};
  for (const asset of manifest.assets.filter((a) => a.path.startsWith('abi/')))
    abis[asset.path.split('/').pop().replace('.json', '')] = JSON.parse(
      await readFile(new URL(`../../dist/${asset.path}`, import.meta.url), 'utf8'),
    );
  const live = JSON.parse(
    await readFile(new URL('../../docs/evidence/chain-check.json', import.meta.url), 'utf8'),
  ).endpoints.find((e) => e.result === 'PASS').state;
  const nft = manifest.contracts.find((c) => c.name === 'VeteransNFT').address;
  const renderer = manifest.contracts.find((c) => c.name === 'VeteransRenderer').address;
  const user = `0x${keccak256(stringToHex('VETERANS browser test account')).slice(-40)}`;
  const price = 69000000000000000n;
  const s = {
    configured: true,
    minted: 3n,
    allowance: 0n,
    balance: 10n ** 20n,
    approved: false,
    staked: [3n],
    pending: 5000000000000000n,
    poolImd: 2000000000000000n,
    eth: 1000000000000000n,
    owner: live.owner,
    account: user,
    weth: zeroAddress,
    renderer,
    frozen: false,
    target: (1n << 252n) - 1n,
    used: new Set(),
    tokenOwners: new Map([
      [1, user],
      [2, user],
      [3, live.staking],
    ]),
    sent: [],
    simulations: [],
    receipts: new Map(),
    failRpc: false,
    revertMint: false,
    revertNext: false,
    delay: 900,
    policy: {
      rulesetId: 0,
      listId: 0,
      customRuleset: zeroAddress,
      globalOptions: 0,
      rulesetOptions: 0,
      tokenType: 721,
    },
  };
  const addressAbi = (address) =>
    address.toLowerCase() === nft.toLowerCase()
      ? 'VeteransNFT'
      : address.toLowerCase() === live.staking.toLowerCase()
        ? 'VeteransStaking'
        : address.toLowerCase() === live.claimPool.toLowerCase()
          ? 'VeteransClaimPool'
          : address.toLowerCase() === renderer.toLowerCase()
            ? 'VeteransRenderer'
            : address.toLowerCase() === live.getTransferValidator.toLowerCase()
              ? 'TransferValidator'
              : 'ERC20';
  const h = keccak256(stringToHex('synthetic block'));
  const started = Date.now();
  function resultFor(name, fn, args = []) {
    if (name === 'VeteransNFT') {
      const values = {
        staking: live.staking,
        claimPool: live.claimPool,
        imd: s.configured ? manifest.network.pairToken.address : zeroAddress,
        weth: s.weth,
        owner: s.owner,
        renderer: s.renderer,
        metadataFrozen: s.frozen,
        getTransferValidator: live.getTransferValidator,
        isConfigured: s.configured,
        totalMinted: s.minted,
        MAX_SUPPLY: 3333n,
        currentEpoch: s.minted / 333n > 9n ? 9n : s.minted / 333n,
        EPOCH_SIZE: 333n,
        EPOCH_COUNT: 10n,
        difficulty: 4n,
        target: s.target,
        mintsRemainingInEpoch: s.minted >= 2997n ? 3333n - s.minted : 333n - (s.minted % 333n),
        mintPrice: price,
        firstSeen: BigInt(Math.floor(Date.now() / 1000) - 9 * 86400),
        balanceOf: BigInt(
          [...s.tokenOwners.values()].filter(
            (a) => a.toLowerCase() === String(args[0]).toLowerCase(),
          ).length,
        ),
        isApprovedForAll: s.approved,
        autoApproveTransfersFromValidator: false,
      };
      if (fn in values) return values[fn];
      if (fn === 'ownerOf') return s.tokenOwners.get(Number(args[0])) || user;
      if (fn === 'seedOf') return numberToHex(Number(args[0]), { size: 32 });
      if (fn === 'nonceUsed') return s.used.has(String(args[1]));
      if (fn === 'tokenURI') {
        const id = Number(args[0]);
        const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#203024"/><rect x="20" y="30" width="60" height="50" fill="${id === 1 ? '#e8cb83' : '#6baf64'}"/><path d="M15 30h70V20H15z" fill="#a8bc66"/><path d="M30 45h10v10H30zm30 0h10v10H60z" fill="#152019"/></svg>`;
        return (
          'data:application/json;base64,' +
          Buffer.from(
            JSON.stringify({
              name: `VETERAN #${id}`,
              description: 'Synthetic metadata for browser validation only.',
              image: 'data:image/svg+xml;base64,' + Buffer.from(art).toString('base64'),
              attributes: [
                { trait_type: 'Tier', value: id === 1 ? 'Overclocked' : 'Veteran' },
                { trait_type: 'Helmet', value: 'Green Hardhat' },
                { trait_type: 'Rarity Score', value: id === 1 ? 26000 : 2000 },
              ],
            }),
          ).toString('base64')
        );
      }
      if (fn === 'mint') return s.minted + 1n;
    }
    if (name === 'VeteransStaking') {
      const values = {
        nft,
        totalStaked: BigInt(s.staked.length),
        totalWeight: BigInt(s.staked.length * 15),
        totalRewardsReceived: 12000000000000000n,
        walletAge: 9n * 86400n,
        currentMultiplier: 15n,
        weightOf: BigInt(s.staked.length * 15),
        stakedTokens: s.staked,
        pendingReward: s.pending,
        stakerOf: user,
        claim: s.pending,
        carryOver: 0n,
      };
      if (fn in values) return values[fn];
    }
    if (name === 'VeteransClaimPool') {
      const values = {
        nft,
        staking: live.staking,
        totalEthReceived: 2000000000000000n,
        totalEthToStakers: 1000000000000000n,
        totalImdReceived: 4000000000000000n,
        treasuryOwed: 0n,
        imdOwed: 4000000000000000n,
        pendingEth: s.eth,
        pendingImd: s.poolImd,
        claimEth: s.eth,
        claimImd: s.poolImd,
        claimAll: [s.eth, s.poolImd],
      };
      if (fn in values) return values[fn];
    }
    if (name === 'ERC20') {
      if (fn === 'balanceOf')
        return args[0].toLowerCase() === live.claimPool.toLowerCase()
          ? 4000000000000000n
          : s.balance;
      if (fn === 'allowance') return s.allowance;
      if (fn === 'decimals') return s.decimals ?? 18;
      if (fn === 'symbol') return 'IMD';
      if (fn === 'approve') return true;
    }
    if (name === 'VeteransRenderer') {
      if (fn === 'rarityScore') return BigInt(args[0]) === 1n ? 26000n : 2000n;
      if (fn === 'traitsOf')
        return {
          background: 0,
          helmet: 1,
          headlamp: 0,
          eyes: 0,
          tool: 0,
          overclocked: BigInt(args[0]) === 1n,
        };
    }
    if (name === 'TransferValidator') {
      if (fn === 'getCollectionSecurityPolicy')
        return s.policy;
      if (fn === 'lastListId') return 3;
    }
    const method = abis[name].find((a) => a.type === 'function' && a.name === fn);
    if (method && method.outputs.length === 0) return undefined;
    throw new Error(`Unmocked read: ${name}.${fn}`);
  }
  function decode(tx) {
    const name = addressAbi(tx.to);
    return { name, ...decodeFunctionData({ abi: abis[name], data: tx.data }) };
  }
  async function rpc(request) {
    const { method, params = [] } = request;
    if (method === 'eth_chainId') return numberToHex(manifest.chainId);
    if (method === 'eth_blockNumber')
      return numberToHex(1000 + Math.floor((Date.now() - started) / 500));
    if (method === 'eth_getCode') return params[0].toLowerCase() === live.getTransferValidator.toLowerCase() &&
        !s.legacyValidator
        ? '0x63' +
            toFunctionSelector(
              'setRulesetOfCollection(address,uint8,address,uint8,uint16)',
            ).slice(2) +
            '63' +
            toFunctionSelector('applyListToCollection(address,uint48)').slice(2)
        : '0x6001600055';
    if (method === 'eth_getBalance') return numberToHex(10n ** 18n);
    if (method === 'eth_gasPrice' || method === 'eth_maxPriorityFeePerGas')
      return numberToHex(100000000n);
    if (method === 'eth_estimateGas') return numberToHex(150000);
    if (method === 'eth_getTransactionCount') return numberToHex(s.sent.length);
    if (method === 'eth_getTransactionByHash') {
      const item = s.receipts.get(params[0]);
      return item
        ? {
            ...item.tx,
            hash: params[0],
            nonce: numberToHex(s.sent.length - 1),
            blockHash: h,
            blockNumber: numberToHex(1000),
            transactionIndex: '0x0',
            input: item.tx.data,
            value: item.tx.value || '0x0',
            gas: numberToHex(150000),
            gasPrice: numberToHex(100000000n),
            type: '0x2',
            chainId: numberToHex(manifest.chainId),
            v: '0x1',
            r: h,
            s: h,
          }
        : null;
    }
    if (method === 'eth_call') {
      const { name, functionName, args } = decode(params[0]);
      const definition = abis[name].find((a) => a.type === 'function' && a.name === functionName);
      if (!['view', 'pure'].includes(definition.stateMutability)) {
        s.simulations.push({ name, functionName, args });
        if (
          name === 'TransferValidator' &&
          functionName === 'applyListToCollection' &&
          args[1] > 3
        ) {
          throw {
            code: 3,
            message: 'execution reverted',
            data: encodeErrorResult({
              abi: abis.TransferValidator,
              errorName: 'CreatorTokenTransferValidator__ListDoesNotExist',
            }),
          };
        }
        if ((s.revertMint && functionName === 'mint') || s.revertNext) {
          s.revertNext = false;
          throw {
            code: 3,
            message: 'execution reverted',
            data: encodeErrorResult({
              abi: abis.VeteransNFT,
              errorName: 'HashAboveTarget',
              args: [numberToHex(1n, { size: 32 }), 1n],
            }),
          };
        }
      }
      const value = resultFor(name, functionName, args);
      return encodeFunctionResult({ abi: abis[name], functionName, result: value });
    }
    if (method === 'eth_sendTransaction' || method === 'wallet_sendTransaction') {
      const tx = params[0];
      const decoded = decode(tx);
      s.sent.push({ ...decoded, tx });
      const { functionName: fn, args = [] } = decoded;
      const hash = keccak256(stringToHex(`test tx ${s.sent.length}`));
      s.receipts.set(hash, { at: Date.now() + s.delay, tx });
      if (fn === 'approve') s.allowance = args[1];
      if (fn === 'mint') {
        s.minted++;
        s.tokenOwners.set(Number(s.minted), s.account);
        s.used.add(String(args[0]));
        s.balance -= price;
        s.allowance -= price;
      }
      if (fn === 'setApprovalForAll') s.approved = args[1];
      if (fn === 'stake') {
        for (const id of args[0]) {
          s.staked.push(id);
          s.tokenOwners.set(Number(id), live.staking);
        }
      }
      if (fn === 'unstake') {
        for (const id of args[0]) {
          s.staked = s.staked.filter((x) => x !== id);
          s.tokenOwners.set(Number(id), s.account);
        }
      }
      if (fn === 'claim') s.pending = 0n;
      if (fn === 'claimEth' || fn === 'claimAll') s.eth = 0n;
      if (fn === 'claimImd' || fn === 'claimAll') s.poolImd = 0n;
      if (fn === 'configure') s.configured = true;
      if (fn === 'freezeMetadata') s.frozen = true;
      if (fn === 'setRulesetOfCollection')
        s.policy = {
          ...s.policy,
          rulesetId: args[1],
          customRuleset: args[2],
          globalOptions: args[3],
          rulesetOptions: args[4],
        };
      if (fn === 'applyListToCollection') s.policy.listId = args[1];
      return hash;
    }
    if (method === 'eth_getTransactionReceipt') {
      if (s.receiptError) throw { code: -32000, message: 'Synthetic receipt transport failure' };
      const receipt = s.receipts.get(params[0]);
      if (!receipt || receipt.at > Date.now()) return null;
      return {
        transactionHash: params[0],
        transactionIndex: '0x0',
        blockHash: h,
        blockNumber: numberToHex(1000),
        from: s.account,
        to: receipt.tx.to,
        cumulativeGasUsed: numberToHex(150000),
        gasUsed: numberToHex(150000),
        effectiveGasPrice: numberToHex(100000000n),
        contractAddress: null,
        logs: [],
        logsBloom: '0x' + '0'.repeat(512),
        status: '0x1',
        type: '0x2',
      };
    }
    if (method === 'eth_getBlockByNumber')
      return {
        number: numberToHex(1000),
        hash: h,
        parentHash: h,
        nonce: '0x0000000000000000',
        sha3Uncles: h,
        logsBloom: '0x' + '0'.repeat(512),
        transactionsRoot: h,
        stateRoot: h,
        receiptsRoot: h,
        miner: zeroAddress,
        difficulty: '0x0',
        totalDifficulty: '0x0',
        extraData: '0x',
        size: '0x1',
        gasLimit: numberToHex(30000000),
        gasUsed: '0x0',
        timestamp: numberToHex(Math.floor(Date.now() / 1000)),
        transactions: [],
        uncles: [],
        baseFeePerGas: numberToHex(100000000n),
      };
    throw new Error(`Unsupported RPC method ${method}`);
  }
  return { state: s, rpc, abis, nft, live, user, price };
}
export async function injectWallet(context, { account, chainId, known = true, multi = false, delayAccounts = 0 }) {
  await context.addInitScript(
    ({ account, chainId, known, multi, delayAccounts }) => {
      const listeners = {};
      const fixture = {
        account,
        chainId,
        known,
        requests: [],
        reject: false,
        authorized: sessionStorage.getItem('test-authorized') === 'yes',
      };
      const emit = (event, value) => (listeners[event] || []).forEach((fn) => fn(value));
      const provider = {
        on: (event, fn) => {
          (listeners[event] ??= []).push(fn);
        },
        removeListener: (event, fn) => {
          listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
        },
        request: async (args) => {
          fixture.requests.push(args);
          if (args.method === 'eth_chainId') return '0x' + fixture.chainId.toString(16);
          if (args.method === 'eth_accounts') {
            if (delayAccounts)
              await new Promise((resolve) => setTimeout(resolve, delayAccounts));
            return fixture.authorized ? [fixture.account] : [];
          }
          if (args.method === 'eth_requestAccounts') {
            if (fixture.reject) {
              fixture.reject = false;
              throw { code: 4001, message: 'User rejected request' };
            }
            fixture.authorized = true;
            sessionStorage.setItem('test-authorized', 'yes');
            return [fixture.account];
          }
          if (args.method === 'wallet_switchEthereumChain') {
            if (!fixture.known) throw { code: 4902, message: 'Unknown chain' };
            fixture.chainId = Number(args.params[0].chainId);
            emit('chainChanged', args.params[0].chainId);
            return null;
          }
          if (args.method === 'wallet_addEthereumChain') {
            fixture.known = true;
            return null;
          }
          if (args.method === 'eth_sendTransaction' && fixture.reject) {
            fixture.reject = false;
            throw { code: 4001, message: 'User rejected request' };
          }
          if (args.method === 'wallet_requestPermissions')
            return [{ parentCapability: 'eth_accounts' }];
          return window.__testRpc(args);
        },
      };
      const info = {
        uuid: '3bbd6285-c3a2-4c25-8642-7e68f18c5b12',
        name: 'Test Wallet',
        rdns: 'test.veterans.wallet',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23b8ee75" d="M0 0h24v24H0z"/></svg>',
      };
      function announce() {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', { detail: { info, provider } }),
        );
      }
      window.addEventListener('eip6963:requestProvider', announce);
      announce();
      window.ethereum = provider;
      window.__walletTest = {
        fixture,
        announce,
        listenerCounts: () =>
          Object.fromEntries(
            Object.entries(listeners).map(([event, callbacks]) => [event, callbacks.length]),
          ),
        setChain: (id) => {
          fixture.chainId = id;
          emit('chainChanged', '0x' + id.toString(16));
        },
        setAccount: (value) => {
          fixture.account = value;
          emit('accountsChanged', [value]);
        },
      };
      if (multi) {
        const otherListeners = {};
        const requests = [];
        const other = {
          on: (event, fn) => {
            (otherListeners[event] ??= []).push(fn);
          },
          removeListener: (event, fn) => {
            otherListeners[event] = (otherListeners[event] || []).filter((f) => f !== fn);
          },
          request: async (args) => {
            requests.push(args);
            if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts')
              return [account];
            if (args.method === 'eth_chainId') return '0x1';
            throw new Error('The competing wallet must not handle this request.');
          },
        };
        const otherInfo = {
          ...info,
          uuid: '64665718-223a-4cb1-8d97-55ae21f044d0',
          name: 'Conflict Wallet',
          rdns: 'test.veterans.conflict',
        };
        const announceOther = () =>
          window.dispatchEvent(
            new CustomEvent('eip6963:announceProvider', {
              detail: { info: otherInfo, provider: other },
            }),
          );
        window.addEventListener('eip6963:requestProvider', announceOther);
        announceOther();
        window.ethereum = other;
        window.__conflictTest = { requests };
      }
    },
    { account, chainId, known, multi, delayAccounts },
  );
}
