# VETERANS frontend

The static VETERANS application for the existing Robinhood Chain deployment. Source lives in `web/`; the committed production site is `../dist/`. This assignment does not deploy contracts, sign transactions, publish an IPFS CID, or assign a site name.

## Run and rebuild

Use Node.js 22.12+ or a supported newer release and npm. Run these commands from the repository root:

```sh
npm ci --prefix web
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run verify
npm --prefix web run preview
```

`preview` serves the production export. `npm --prefix web run dev` first builds the deployment files, then starts Vite with hot reload. Its development middleware reads the same exported manifest and ABIs. The checkout must contain deployed source commit `d3de6035fe432600d7f669ba8104e1ba4bbb37be`; `scripts/export.mjs` reads its ABI files directly with `git show` and rejects a mismatched handoff hash.

The build runs typecheck, creates `dist/` with Vite's relative `./` base, exports the pinned raw ABI arrays, and **finally** writes `dist/imd-deployment.json`. Never edit an exported asset after generating its inventory. Rebuild and run `verify` after changes. Hash routing supports plain static hosting and gateway directory subpaths without server rewrites. The publisher hosts the committed export without rebuilding it.

To regenerate the share image after a visual change:

```sh
npm --prefix web exec playwright install chromium
node web/scripts/share.mjs
npm --prefix web run build
```

The worker used `PLAYWRIGHT_BROWSERS_PATH=/tmp/veterans-playwright` for its disposable browser installation. Set the same variable for install and test commands if choosing a nondefault browser directory.

## Deployment configuration

`src/config.ts` loads `./imd-deployment.json` at runtime, checks ABI SHA-256 inventory entries and the attested canonical Keccak ABI hashes, and constructs the chain, public client, and wallet connectors from that file. No application module contains an independent deployment address or RPC map.

`config/deployment-handoff.json` and `config/network-handoff.json` are preserved build inputs, copied from the assignment's pinned handoff. They are not separately imported by the browser. The manifest includes the handoff's exact contract set and unchanged network and wallet-add-chain objects. This application handoff has no `poolKey` or trading pool. There are no swap, liquidity, router approval, or invented token-launch flows.

The NFT's `staking()`, `claimPool()`, `imd()`, `weth()`, `renderer()`, `owner()`, and `getTransferValidator()` resolve all related addresses at runtime. Before enabling writes, the app checks the RPC chain ID, nonempty code for both attested contracts and both siblings, sibling-to-NFT linkage, and the claim pool's staking linkage. It checks the connected wallet's chain again before signing.

The pinned network IMD address is offered as an owner setup input, never substituted for an unset `nft.imd()`. WETH has an empty, owner-entered setting because the handoff does not supply its address. No credential, relay, WalletConnect project ID, or private RPC is required.

## Use the application

- **Mine:** read supply, epoch, difficulty, price, balances, and epoch progress. Connect a wallet, approve exactly one mint's IMD, run the background PoW worker, and review the winning mint. Mining can be paused. Changing account, network readiness, or target discards the proof. Auto-mine starts another proof after the prior mint and any necessary approval; it never automatically signs a mint.
- **Gallery:** browse all 3,333 numbered slots, search a token number, inspect minted on-chain metadata, filter Overclocked tokens, and sort by the renderer's rarity score. Unmined slots have no invented traits. Rarity filters scan the minted collection only after an explicit request. The scan has progress and cancellation.
- **My Veterans:** load current NFT ownership, select owned or staked tokens, approve/revoke staking, stake, unstake, refresh age weight, or review a safe transfer. Staking has no lock. The app reads `stakedTokens` directly and uses a bounded ownership scan for unstaked holdings.
- **Staking:** see the total staked count, recorded weights, current age multiplier, and an estimate per future mint using the current recorded weights. Load a leaderboard of current stakers ranked by age or claimable staking IMD. This is a snapshot, not an indexed history or promised yield.
- **Claim:** claim staking IMD, pool IMD, pool ETH, or both pool balances together. Maintenance controls distribute surplus IMD royalties, unwrap configured WETH, retry an owed treasury payment, and donate ETH to stakers.
- **Contracts & setup:** inspect full checksummed addresses with copy and explorer links. The connected owner can configure IMD and WETH, update the transfer-validator policy and operator list, update/freeze metadata, manage validator approval, and transfer/renounce ownership. Irreversible actions require an acknowledgement and wallet confirmation.

All writes are simulated during review and again before signing. Buttons remain locked through receipt confirmation and state refresh. Errors distinguish wallet rejection, insufficient fees, custom contract reverts, and RPC failure. If receipt status becomes uncertain, writes stay locked and a manual confirmation check is offered. Replacements are followed; a changed/cancelled transaction is not reported as a successful application action.

## Read behavior and wallets

Public reads use the network's two public RPCs in their supplied order. Each HTTP request has a four-second timeout and batching is disabled so endpoints that reject JSON-RPC batches can still simulate transactions. A transient failure retries one complete fallback pass. A connected wallet is the last fallback, with an eight-second bound and a fresh, shared in-flight chain check. Contract reverts stop fallback immediately. Global and personal reads refresh every five seconds while connected; disconnected global reads refresh every 30 seconds. Deployment verification refreshes every minute. Inventory and leaderboard scans are explicit and bounded; metadata is fetched for visible tokens. A failed required read disables writes and presents recovery.

Browser extensions are discovered by EIP-6963. All application provider lookups validate that `getProvider` exists and that its result supports `request`; concurrent lookups share their pending result. Reload restores only the last explicitly chosen connector, after discovery supplies a real connector, rather than probing every authorized extension and SDK. A generic injected provider is not restored when named wallets are present. The fallback provider is cleared during reconnect, network changes and disconnect, and transactions recheck wallet identity before signing. The picker lists their own names and icons and suppresses the generic row when a named provider exists. Phones receive MetaMask, Coinbase Wallet, Rabby, and Phantom app links plus Coinbase Smart Wallet. Coinbase's SDK is installed explicitly and bundled; no relay is used. Unknown-chain switching invokes the exact supplied `wallet_addEthereumChain` parameters and switches again. Actual wallet-app handoff and passkey creation require device testing after delivery.

## Checks

```sh
npm --prefix web test
npm --prefix web run test:browser
npm --prefix web run check:chain
npm --prefix web run verify
```

The 17 Node tests cover malformed/persisted connectors, concurrent provider lookup, RPC failure/retry/revert behavior, wrong-chain and replaced providers, error translation, PoW binding and target comparison, ABI hashes, amount precision, invalid addresses, error translation, mobile links, and unknown-chain switching. The browser suite starts and closes its own HTTP preview and Chromium instance. It exercises the **built export**, with synthetic RPC/EIP-6963 fixtures, and writes `docs/evidence/wallet-rpc-interactions.json`, `wallet-rpc-accessibility.json` and a labelled fixture screenshot. It never sends a real transaction. `check:chain` makes read-only requests to both configured public endpoints and records chain identity, code availability, and live configuration.

All 34 browser interaction groups passed, including conflicting extensions across reload, repeated discovery/reconnection, public RPC batch rejection, both policy choices, operator list validation and incompatible validators. No captured script errors, MaxListeners warnings or orphaned-stream messages occurred. The six-route axe scans reported no violations. A fixture cannot establish compatibility with every installed wallet.

For read-only simulation of the deployed validator, run `node --import tsx scripts/check-policy.mjs` from `web/`. It reads the owner/current validator, simulates both policy choices and reapplying the existing list, and estimates gas on both configured public RPCs. It writes `docs/evidence/policy-check.json` and never broadcasts. All six simulations/estimates passed in this run.

See [current validation](../docs/WALLET-RPC-VALIDATION.md), [implementation and ABI provenance](../docs/FRONTEND.md), and [the final design system](../DESIGN.md). Keep dependency directories, package caches, browser downloads, and dependency archives out of Git. The existing ignore files were not changed. This worker installed dependencies only in disposable test scaffolding; no dependency/cache directory is part of the deliverable.
