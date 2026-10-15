import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { encodePacked, keccak256 } from 'viem';
import { serve } from './server.mjs';
import { injectWallet, mockChain } from './mock-chain.mjs';
const manifest = JSON.parse(
  await readFile(new URL('../../dist/imd-deployment.json', import.meta.url), 'utf8'),
);
const preview = await serve(),
  browser = await chromium.launch({ headless: true });
const results = [],
  errors = [],
  walletWarnings = [];
let context, page, chain;
async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, result: 'PASS', durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, result: 'FAIL', error: e.message, durationMs: Date.now() - start });
    throw e;
  }
}
async function fresh(options = {}) {
  if (context) await context.close();
  chain = await mockChain(manifest);
  Object.assign(chain.state, options.state || {});
  context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 1000 },
    ...(options.mobile
      ? {
          isMobile: true,
          hasTouch: true,
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        }
      : {}),
  });
  await context.exposeBinding('__testRpc', async (_, request) => chain.rpc(request));
  if (options.wallet) {
    chain.state.account = options.owner ? chain.live.owner : chain.user;
    await injectWallet(context, {
      account: chain.state.account,
      chainId: options.wrong ? 1 : manifest.chainId,
      known: !options.wrong,
      multi: !!options.multi,
      delayAccounts: options.delayAccounts || 0,
    });
  }
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (options.badAbi && url.endsWith('imd-deployment.json')) {
      const corrupt = structuredClone(manifest);
      corrupt.assets.find((a) => a.path === 'abi/VeteransNFT.json').sha256 = '0'.repeat(64);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(corrupt) });
    }
    if (manifest.network.rpcUrls.some((rpc) => url.startsWith(rpc))) {
      if (chain.state.failRpc ||
        (options.failPrimary && url.startsWith(manifest.network.rpcUrls[0]))
      )
        return route.fulfill({
          status: 503,
          headers: { 'access-control-allow-origin': '*' },
          body: 'Unavailable during test',
        });
      const payload = JSON.parse(route.request().postData());
      if (options.rejectBatch && Array.isArray(payload))
        return route.fulfill({
          status: 400,
          body: 'Batch requests unsupported',
        });
      const handle = async (request) => {
        try {
          return { jsonrpc: '2.0', id: request.id, result: await chain.rpc(request) };
        } catch (e) {
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: e.code || -32000, message: e.message, data: e.data },
          };
        }
      };
      const data = Array.isArray(payload)
        ? await Promise.all(payload.map(handle))
        : await handle(payload);
      return route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(data),
      });
    }
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (
      /MaxListenersExceeded|ObjectMultiplex|orphaned.*stream|getProvider.*not a function/i.test(
        message.text(),
      )
    )
      walletWarnings.push(message.text());
  });
  await page.goto(preview.url);
  await page
    .getByRole('heading', { name: 'Mine your legacy.' })
    .waitFor()
    .catch((e) => {
      if (!options.badAbi) throw e;
    });
  if (!options.badAbi && !chain.state.failRpc) await page.getByText(/Live state · block/).waitFor();
}
async function connect() {
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Test Wallet', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function review(button, success) {
  await page.getByRole('button', { name: button, exact: true }).click();
  await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).click();
  await page.getByText(success, { exact: true }).first().waitFor();
}
async function nav(id) {
  await page.locator(`nav a[href="#${id}"]`).click();
}
async function noOverflow() {
  const measured = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  assert(measured.width <= measured.viewport + 1, JSON.stringify(measured));
}
try {
  await check(
    'Multiple extensions stay isolated from window.ethereum and restore only the chosen wallet',
    async () => {
      await fresh({ wallet: true, multi: true, delayAccounts: 80 });
      await connect();
      await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).waitFor();
      await page.reload();
      await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__conflictTest.requests), []);
      assert.equal(await page.getByText('The mine could not load.').count(), 0);
      assert.equal(await page.getByRole('button', { name: /Switch to/ }).count(), 0);
      await review('Approve 0.069 IMD', 'Approve IMD confirmed.');
      assert.equal(chain.state.sent.length, 1);
      assert.deepEqual(await page.evaluate(() => window.__conflictTest.requests), []);
    },
  );
  await check(
    'Repeated announcements and twelve reconnect cycles do not multiply provider listeners',
    async () => {
      await page.evaluate(() => {
        for (let i = 0; i < 25; i++) window.__walletTest.announce();
      });
      for (let i = 0; i < 12; i++) {
        await page.locator('.wallet-button').click();
        await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
        await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
        assert.equal(
          await page.getByRole('button', { name: 'Test Wallet', exact: true }).count(),
          1,
        );
        await page.getByRole('button', { name: 'Test Wallet', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        const counts = await page.evaluate(() => window.__walletTest.listenerCounts());
        assert(
          Object.values(counts).every((n) => n <= 1),
          JSON.stringify(counts),
        );
      }
      assert.deepEqual(await page.evaluate(() => window.__conflictTest.requests), []);
    },
  );
  await check(
    'Secondary public RPC handles setup simulation when the first endpoint fails and batches are rejected',
    async () => {
      await fresh({
        wallet: true,
        owner: true,
        failPrimary: true,
        rejectBatch: true,
      });
      await connect();
      await page.getByRole('link', { name: 'Contracts & setup' }).click();
      await page.getByText('Ruleset 0 · list 0', { exact: true }).waitFor();
      await review('Review transfer rules', 'Set transfer policy confirmed.');
      assert.equal(chain.state.sent.at(-1).functionName, 'setRulesetOfCollection');
      assert.deepEqual(chain.state.sent.at(-1).args.slice(1), [4, '0x' + '0'.repeat(40), 3, 6]);
      assert.equal(
        (await page.evaluate(() => window.__walletTest.fixture.requests)).filter(
          (r) => r.method === 'eth_call',
        ).length,
        0,
      );
      await page.getByText('Ruleset 4 · list 0', { exact: true }).waitFor();
    },
  );
  await check(
    'Operator-only policy, valid list, invalid list and uint48 bounds use the deployed interface',
    async () => {
      await page.getByLabel(/^Transfer rules/).selectOption('operators');
      const sentBefore = chain.state.sent.length;
      await review('Review transfer rules', 'Set transfer policy confirmed.');
      assert.equal(chain.state.sent.length, sentBefore + 1);
      assert.equal(chain.state.sent.at(-1).args[4], 1);
      await page.getByLabel('Existing operator list ID').fill('2');
      await review('Review operator list', 'Apply operator list confirmed.');
      assert.equal(chain.state.sent.at(-1).tx.data.slice(0, 10), '0x9c840334');
      await page.getByText('Ruleset 4 · list 2', { exact: true }).waitFor();
      await page.getByLabel('Existing operator list ID').fill('4');
      await page.getByRole('button', { name: 'Review operator list', exact: true }).click();
      await page
        .getByText(
          'This operator list does not exist. Check the list ID on the validator and try again.',
        )
        .waitFor();
      assert(
        await page.getByRole('button', { name: 'Simulation failed', exact: true }).isDisabled(),
      );
      assert.equal(await page.getByText(/The network could not be reached/).count(), 0);
      assert.equal(chain.state.sent.length, sentBefore + 2);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByLabel('Existing operator list ID').fill('281474976710656');
      await page.getByRole('button', { name: 'Review operator list', exact: true }).click();
      await page.getByText('Enter an existing list ID from 0 to 281474976710655.').waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
    },
  );
  await check(
    'An incompatible replacement validator fails closed instead of misreading policy words',
    async () => {
      await fresh({
        wallet: true,
        owner: true,
        state: { legacyValidator: true },
      });
      await connect();
      await page.getByRole('link', { name: 'Contracts & setup' }).click();
      await page.getByText(/This validator uses a different policy interface/).waitFor();
      assert(await page.getByRole('button', { name: 'Review transfer rules' }).isDisabled());
      assert(await page.getByRole('button', { name: 'Review operator list' }).isDisabled());
    },
  );
  await check(
    'Disconnected production export loads at a gateway subpath; mining is disabled',
    async () => {
      await fresh();
      assert(await page.getByRole('button', { name: 'Start mining', exact: true }).isDisabled());
      assert(await page.getByRole('button', { name: 'Connect wallet' }).isEnabled());
      assert.equal(await page.locator('h1').count(), 1);
    },
  );
  await check('390px first screen includes product, state, wallet and primary action', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow();
    const box = await page.getByRole('button', { name: 'Start mining', exact: true }).boundingBox();
    assert(box.y + box.height <= 844);
    assert((await page.getByRole('button', { name: 'Connect wallet' }).boundingBox()).y < 844);
    await page.screenshot({
      path: new URL('../../docs/evidence/wallet-rpc-mine-mobile-mocked.jpg', import.meta.url).pathname,
      quality: 82,
    });
  });
  await check(
    'Mobile picker offers all four wallet app links and Coinbase Smart Wallet',
    async () => {
      await fresh({ mobile: true, viewport: { width: 390, height: 844 } });
      await page.getByRole('button', { name: 'Connect wallet' }).click();
      for (const name of ['MetaMask', 'Coinbase Wallet', 'Rabby', 'Phantom'])
        assert(await page.getByRole('link', { name: `Open in ${name}` }).isVisible());
      assert(await page.getByRole('button', { name: 'Coinbase Smart Wallet' }).isVisible());
      await noOverflow();
      await page.keyboard.press('Escape');
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        'Connect wallet',
      );
    },
  );
  await check(
    'EIP-6963 named discovery hides generic injected row and handles wallet rejection',
    async () => {
      await fresh({ wallet: true, wrong: true });
      await page.getByRole('button', { name: 'Connect wallet' }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Browser wallet', exact: true }).count(),
        0,
      );
      await page.evaluate(() => (window.__walletTest.fixture.reject = true));
      await page.getByRole('button', { name: 'Test Wallet', exact: true }).click();
      await page.getByText('Request declined in your wallet. You can try again.').waitFor();
      assert(await page.getByRole('button', { name: 'Test Wallet', exact: true }).isEnabled());
    },
  );
  await check(
    'Unknown-chain connection switches, adds exact supplied chain, then switches again',
    async () => {
      await page.getByRole('button', { name: 'Test Wallet', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).waitFor();
      const requests = await page.evaluate(() => window.__walletTest.fixture.requests);
      assert.deepEqual(
        requests
          .filter((r) => r.method.startsWith('wallet_') && r.method.includes('EthereumChain'))
          .map((r) => r.method),
        ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain'],
      );
      assert.deepEqual(requests.find((r) => r.method === 'wallet_addEthereumChain').params, [
        manifest.walletAddChain,
      ]);
    },
  );
  await check('Wrong-chain state prevents approvals and mining until switched', async () => {
    await page.evaluate(() => window.__walletTest.setChain(1));
    await page.getByRole('button', { name: `Switch to ${manifest.network.name}` }).waitFor();
    assert(await page.getByRole('button', { name: 'Start mining', exact: true }).isDisabled());
    assert.equal(
      await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).count(),
      0,
    );
    await page.getByRole('button', { name: `Switch to ${manifest.network.name}` }).click();
    await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).waitFor();
  });
  await check('Rejected token approval is recoverable and never sends a transaction', async () => {
    await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).click();
    await page.evaluate(() => (window.__walletTest.fixture.reject = true));
    await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).click();
    await page.getByText('Request declined in your wallet. You can try again.').waitFor();
    assert.equal(chain.state.sent.length, 0);
    assert(await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).isEnabled());
  });
  await check(
    'Exact one-mint approval is simulated and remains disabled until receipt/refetch',
    async () => {
      chain.state.delay = 1500;
      await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).click();
      await page.getByText('Transaction submitted. Waiting for confirmation…').waitFor();
      assert(await page.getByRole('button', { name: 'Confirming…', exact: true }).isDisabled());
      await page.getByText('Approve IMD confirmed.', { exact: true }).waitFor();
      const sent = chain.state.sent.at(-1);
      assert.equal(sent.functionName, 'approve');
      assert.equal(sent.args[0].toLowerCase(), chain.nft.toLowerCase());
      assert.equal(sent.args[1], chain.price);
      assert(chain.state.simulations.filter((s) => s.functionName === 'approve').length >= 2);
    },
  );
  await check(
    'Real background PoW worker finds a wallet-bound proof; simulation blocks a stale proof',
    async () => {
      await page.getByRole('button', { name: 'Start mining', exact: true }).click();
      await page.getByRole('button', { name: 'Mint Veteran · 0.069 IMD', exact: true }).waitFor();
      chain.state.revertMint = true;
      await page.getByRole('button', { name: 'Mint Veteran · 0.069 IMD', exact: true }).click();
      await page
        .getByText('Difficulty changed. Start mining again for the current target.')
        .waitFor();
      assert(
        await page.getByRole('button', { name: 'Simulation failed', exact: true }).isDisabled(),
      );
      assert.equal(chain.state.sent.length, 1);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      chain.state.revertMint = false;
    },
  );
  await check(
    'Mint submits the actual winning nonce and refreshes allowance and supply',
    async () => {
      await review('Mint Veteran · 0.069 IMD', 'Mint Veteran confirmed.');
      const sent = chain.state.sent.at(-1);
      assert.equal(sent.functionName, 'mint');
      const hash = keccak256(
        encodePacked(
          ['uint256', 'address', 'address', 'uint256'],
          [BigInt(manifest.chainId), chain.nft, chain.user, sent.args[0]],
        ),
      );
      assert(BigInt(hash) < chain.state.target);
      assert.equal(chain.state.minted, 4n);
      assert(
        await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).isEnabled(),
      );
    },
  );
  await check(
    'Collection ownership index, explicit staking approval and stake transaction',
    async () => {
      await nav('veterans');
      await page.getByRole('button', { name: 'Load collection index', exact: true }).click();
      await page.getByLabel('Select Veteran #1', { exact: true }).waitFor();
      await page.getByLabel('Select Veteran #1', { exact: true }).check();
      await review('Approve staking', 'Approve staking confirmed.');
      assert.equal(chain.state.sent.at(-1).functionName, 'setApprovalForAll');
      await page.getByRole('button', { name: 'Load collection index', exact: true }).click();
      await page.getByLabel('Select Veteran #1', { exact: true }).check();
      await review('Stake selected', 'Stake Veterans confirmed.');
      assert(chain.state.staked.includes(1n));
    },
  );
  await check('Unstake returns the selected token and preserves claimable rewards', async () => {
    await page.getByRole('button', { name: /^Staked \(/ }).click();
    await page.getByLabel('Select Veteran #1', { exact: true }).check();
    const pending = chain.state.pending;
    await review('Unstake selected', 'Unstake Veterans confirmed.');
    assert(!chain.state.staked.includes(1n));
    assert.equal(chain.state.pending, pending);
  });
  await check(
    'Individual staking IMD, pool IMD and ETH claims route to the correct siblings',
    async () => {
      await nav('claim');
      const panels = page.locator('.claim-panel');
      for (const [index, fn] of [
        [0, 'claim'],
        [1, 'claimImd'],
        [2, 'claimEth'],
      ]) {
        await panels.nth(index).getByRole('button').click();
        await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).click();
        await panels
          .nth(index)
          .getByText(/confirmed\./)
          .waitFor();
        assert.equal(chain.state.sent.at(-1).functionName, fn);
        assert(await panels.nth(index).getByRole('button').isDisabled());
      }
      assert.equal(chain.state.pending + chain.state.poolImd + chain.state.eth, 0n);
    },
  );
  await check(
    'Gallery searches all 3333 slots and uses on-chain rarity data for filters',
    async () => {
      await nav('gallery');
      await page.getByLabel('Find token').fill('3333');
      assert(await page.getByText('Veteran #3333', { exact: true }).isVisible());
      assert(await page.getByRole('button', { name: 'View Veteran #3333 traits' }).isDisabled());
      await page.getByLabel('Find token').fill('');
      await page.getByLabel(/^Show/).selectOption('overclocked');
      await page.getByRole('button', { name: 'Load collection index', exact: true }).click();
      await page.getByText('Veteran #1', { exact: true }).waitFor();
      assert.equal(await page.locator('.token-card').count(), 1);
      await page.getByRole('button', { name: 'View Veteran #1 traits' }).click();
      await page.getByRole('dialog').getByText('Green Hardhat', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
    },
  );
  await check('All six sections reflow at 320, 390 and 1440 including full addresses', async () => {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const section of ['mine', 'gallery', 'veterans', 'staking', 'claim', 'setup']) {
        await page.goto(preview.url + '#' + section);
        await page.locator('main h1').waitFor();
        await noOverflow();
      }
    }
  });
  await check(
    'Owner setup validates inputs and binds configure to the immutable siblings',
    async () => {
      await fresh({
        wallet: true,
        owner: true,
        state: { configured: false, minted: 0n, tokenOwners: new Map(), staked: [] },
      });
      await connect();
      await page.getByRole('link', { name: 'Contracts & setup' }).click();
      await page.getByRole('heading', { name: 'Owner controls' }).waitFor();
      await page.getByLabel('IMD contract', { exact: true }).fill('0x' + '0'.repeat(40));
      await page.getByRole('button', { name: 'Review IMD setup', exact: true }).click();
      await page.getByText('Enter a valid, nonzero contract address.', { exact: true }).waitFor();
      assert.equal(chain.state.sent.length, 0);
      await page
        .getByRole('button', { name: 'Use IMD from network configuration', exact: true })
        .click();
      await page.getByRole('button', { name: 'Review IMD setup', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      assert(
        await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).isDisabled(),
      );
      await page.getByLabel('I understand this action cannot be undone.').check();
      await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).click();
      await page.getByText('Configure IMD confirmed.', { exact: true }).waitFor();
      const tx = chain.state.sent.at(-1);
      assert.deepEqual(
        tx.args.map((a) => a.toLowerCase()),
        [manifest.network.pairToken.address, chain.live.staking, chain.live.claimPool].map((a) =>
          a.toLowerCase(),
        ),
      );
    },
  );
  await check('Irreversible metadata freeze requires a separate acknowledgement', async () => {
    await page.getByRole('button', { name: 'Freeze metadata forever', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).isDisabled());
    await page.getByLabel('I understand this action cannot be undone.').check();
    await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).click();
    await page.getByText('Freeze metadata forever confirmed.', { exact: true }).waitFor();
    assert(chain.state.frozen);
    assert(
      await page.getByRole('button', { name: 'Freeze metadata forever', exact: true }).isDisabled(),
    );
  });
  await check(
    'Auto-mine prepares the next proof after approval without sending it automatically',
    async () => {
      await fresh({ wallet: true, state: { allowance: 69000000000000000n } });
      await connect();
      await page.getByLabel(/Auto-mine next proof/).check();
      await page.getByRole('button', { name: 'Start mining', exact: true }).click();
      await page.getByRole('button', { name: 'Mint Veteran · 0.069 IMD', exact: true }).waitFor();
      await review('Mint Veteran · 0.069 IMD', 'Mint Veteran confirmed.');
      assert.equal(chain.state.sent.length, 1);
      await review('Approve 0.069 IMD', 'Approve IMD confirmed.');
      await page.getByRole('button', { name: 'Mint Veteran · 0.069 IMD', exact: true }).waitFor();
      assert.equal(chain.state.sent.length, 2, 'No automatic mint transaction');
    },
  );
  await check(
    'Pausing and changing wallet accounts terminate the mining worker and discard old proofs',
    async () => {
      await page.getByLabel(/Auto-mine next proof/).uncheck();
      chain.state.target = 0n;
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.getByRole('button', { name: 'Start mining', exact: true }).click();
      await page.getByRole('button', { name: 'Pause mining', exact: true }).click();
      assert(await page.getByRole('button', { name: 'Start mining', exact: true }).isVisible());
      await page.getByRole('button', { name: 'Start mining', exact: true }).click();
      await page.evaluate((account) => window.__walletTest.setAccount(account), chain.live.owner);
      await page.getByRole('button', { name: 'Start mining', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Pause mining', exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole('button', { name: 'Mint Veteran · 0.069 IMD', exact: true }).count(),
        0,
      );
    },
  );
  await check('Long balances and full owner addresses reflow at both narrow widths', async () => {
    await fresh({ wallet: true, owner: true, state: { balance: (1n << 256n) - 1n } });
    await connect();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow();
      await page.getByRole('link', { name: 'Contracts & setup' }).click();
      await page.getByRole('heading', { name: 'Owner controls' }).waitFor();
      await noOverflow();
      await nav('mine');
    }
  });
  await check(
    'Keyboard skip link preserves the current route and native dialogs restore focus',
    async () => {
      await nav('gallery');
      await page.keyboard.press('Control+Home');
      await page.locator('.skip-link').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => location.hash), '#gallery');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
      await page.locator('.wallet-button').click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'wallet-button ');
    },
  );
  await check(
    'Uncertain receipt keeps writes locked until a successful manual confirmation check',
    async () => {
      await fresh({ wallet: true });
      await connect();
      chain.state.receiptError = true;
      await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).click();
      await page.getByRole('button', { name: 'Check confirmation', exact: true }).waitFor();
      assert.equal(chain.state.sent.length, 1);
      assert(
        await page.getByRole('button', { name: /Start mining|Awaiting receipt…/ }).isDisabled(),
      );
      chain.state.receiptError = false;
      for (let i = 0; i < 8; i++) {
        await page.getByRole('button', { name: 'Check confirmation', exact: true }).click();
        await page.waitForTimeout(250);
        if (await page.getByText('Approve IMD confirmed.', { exact: true }).isVisible()) break;
      }
      await page.getByText('Approve IMD confirmed.', { exact: true }).waitFor();
      assert.equal(chain.state.sent.length, 1);
    },
  );
  await check(
    'Sold-out supply disables mining and never offers an unnecessary mint approval',
    async () => {
      await fresh({ wallet: true, state: { minted: 3333n } });
      await connect();
      assert(
        await page.getByRole('button', { name: 'All Veterans mined', exact: true }).isDisabled(),
      );
      assert.equal(
        await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).count(),
        0,
      );
    },
  );
  await check(
    'Unexpected mint-token decimals disable the fixed-price mint and approval controls',
    async () => {
      await fresh({ wallet: true, state: { decimals: 6 } });
      await connect();
      await page
        .getByText(
          'The configured mint token must report IMD with 18 decimals. Mining is unavailable.',
        )
        .waitFor();
      assert(await page.getByRole('button', { name: 'Start mining', exact: true }).isDisabled());
      assert.equal(
        await page.getByRole('button', { name: 'Approve 0.069 IMD', exact: true }).count(),
        0,
      );
    },
  );
  await check(
    'Combined pool claim and leaderboard read the deployed sibling interfaces',
    async () => {
      await fresh({ wallet: true });
      await connect();
      await nav('claim');
      await review('Claim both pool rewards', 'Claim both pool rewards confirmed.');
      assert.equal(chain.state.sent.at(-1).functionName, 'claimAll');
      assert.equal(chain.state.poolImd + chain.state.eth, 0n);
      assert(chain.state.pending > 0n);
      await nav('staking');
      await page.getByRole('button', { name: 'Load collection index', exact: true }).click();
      await page.locator('.leaderboard-list li').waitFor();
      assert.equal(await page.locator('.leaderboard-list li').count(), 1);
      await page.getByLabel(/^Rank by/).selectOption('rewards');
      await page.locator('.leaderboard-list li').waitFor();
    },
  );
  await check(
    'Connected wallet RPC fallback preserves reads when both public endpoints fail',
    async () => {
      chain.state.failRpc = true;
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector('.live-state')?.textContent.includes('Live state'),
      );
      await page.waitForFunction(() =>
        window.__walletTest.fixture.requests.some((r) => r.method === 'eth_call'),
      );
      assert.equal(await page.getByText('Live data unavailable.', { exact: true }).count(), 0);
      chain.state.failRpc = false;
    },
  );
  await check('Rendered accessibility scan finds no serious or critical violations', async () => {
    const audits = [];
    for (const section of ['mine', 'gallery', 'veterans', 'staking', 'claim', 'setup']) {
      await page.goto(preview.url + '#' + section);
      await page.locator('main h1').waitFor();
      await page.addScriptTag({
        path: new URL('../node_modules/axe-core/axe.min.js', import.meta.url).pathname,
      });
      const audit = await page.evaluate(async () => {
        const result = await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        });
        return result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        }));
      });
      audits.push({ section, violations: audit });
      assert.equal(
        audit.filter((v) => ['critical', 'serious'].includes(v.impact)).length,
        0,
        JSON.stringify(audit),
      );
    }
    await writeFile(
      new URL('../../docs/evidence/wallet-rpc-accessibility.json', import.meta.url),
      JSON.stringify(audits, null, 2) + '\n',
    );
  });
  await check('Public RPC failure displays recovery and keeps actions disabled', async () => {
    await fresh({ state: { failRpc: true } });
    await page.getByText('Live data unavailable.', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Start mining', exact: true }).isDisabled());
    chain.state.failRpc = false;
    await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
    await page.getByText(/Live state · block/).waitFor();
  });
  await check('ABI tampering fails closed before wallet or transaction controls load', async () => {
    await fresh({ badAbi: true });
    await page.getByRole('heading', { name: 'Deployment unavailable.' }).waitFor();
    await page.getByText('Integrity check failed for abi/VeteransNFT.json.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Connect wallet' }).count(), 0);
  });
  assert.deepEqual(errors, [], 'No browser script errors');
  assert.deepEqual(walletWarnings, [], 'No wallet listener or orphaned-stream warnings');
} catch (error) {
  console.error(error.message);
  if (page) {
    await writeFile(
      new URL('../../test/scratch/browser-failure.txt', import.meta.url),
      await page.locator('body').innerText(),
    );
    await page.screenshot({
      path: new URL('../../test/scratch/browser-failure.png', import.meta.url).pathname,
    });
  }
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('../../docs/evidence/wallet-rpc-interactions.json', import.meta.url),
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        environment:
          'Chromium, production export at /preview/, synthetic RPC and EIP-6963 wallet; no broadcasts',
        results,
        scriptErrors: errors,
        walletWarnings,
      },
      null,
      2,
    ) + '\n',
  );
  if (context) await context.close();
  await browser.close();
  await preview.close();
}
