# VETERANS implementation and deployment notes

This frontend targets the already deployed application at source commit `d3de6035fe432600d7f669ba8104e1ba4bbb37be`, launch `18d391e8-b53a-4f70-b9f3-3419fd6b8a48`, chain ID **4663**. The runtime source of truth is [`dist/imd-deployment.json`](../dist/imd-deployment.json).

## Verified deployment binding

| Contract | Attested address | Canonical Keccak ABI hash |
| --- | --- | --- |
| VeteransRenderer | `0x52aaebf6aabe67b182eca14e3df52601b92765b7` | `c5d6bbfa9dcc1b80975836519faad81910fb60355590b3fc5be20afd7bee29b2` |
| VeteransNFT | `0x582ea0b5c023f354e0b95bfcb5c12a2062e8e033` | `bd4ea42d960ad5325217e55b740355d492ca2e55d62efd0d1d4d72c0e6742643` |

The canonical hash recursively sorts object keys, preserves array order, encodes compact JSON as UTF-8, then computes Keccak-256 without an `0x` prefix. The exporter obtains each raw ABI array from `git show <sourceCommit>:docs/abi/<Contract>.json`; the two attested hashes were verified before implementation and during every build. Staking, pool, and unwrapper ABIs come from the same source commit. They appear as hashed assets, without adding unattested contracts to the manifest's contract set.

At the recorded read-only check, `VeteransNFT.staking()` returned `0x5d675D359f72902E0066146846730531F594b23B` and `claimPool()` returned `0x3Ad9BBDAc6058C14c44b530881ED38c32aF8e5d1`. These are documentation snapshots, not browser configuration. The browser resolves and verifies the siblings from the NFT on every new session. Both configured RPCs returned chain 4663 and nonempty code for the attested contracts and siblings. Current observations and check time are in [wallet-rpc-chain-check.json](evidence/wallet-rpc-chain-check.json); the earlier chain-check file is retained as historical evidence.

## Deployed behavior reflected in the UI

- On 2026-10-15 both public RPCs reported **IMD and WETH configured**, with zero NFTs minted. These values are live reads, not new configuration. The frontend still exposes owner setup and disables unavailable actions. No deployment configuration was changed by this worker.
- Minting charges the deployed constant `0.069 × 10^18` units. Owner setup checks IMD's symbol and 18 decimals; mining also refuses unexpected mint-token metadata. Approval authorizes the NFT to spend exactly one mint price, not an unlimited allowance.
- The proof preimage is exactly packed `(uint256 chainId, address nft, address wallet, uint256 nonce)`, hashed by Keccak-256 and compared strictly below the latest target. A Web Worker runs bounded batches. Proofs do not reserve a mint or survive a stricter target automatically.
- The deployed epoch is zero-based and displayed as 1–10. Epochs 1–9 have 333 mints; epoch 10 has 336. This preserves both the deployed supply cap of 3,333 and ten epochs.
- The 20% mint allocation remains **IMD in the claim pool**, not ETH. ETH rewards come from received royalties and donations. Separate claim controls show these balances accurately.
- The home distribution figure is staking `totalRewardsReceived - carryOver`, meaning IMD allocated to stakers, including amounts not yet claimed. The dashboard separately shows staking IMD received. Pool totals distinguish lifetime receipts from current balances.
- Age starts at the first mint or stake in this collection. Current age multiplier and recorded weight are distinct. Weight updates on stake, unstake, staking claim, or explicit refresh; the pool's standalone claims do not refresh weight.
- A 6.9% ERC-2981 royalty setting is not proof of permanent marketplace enforcement. The owner can change the transfer validator and its policy. Setup displays the policy it can read and offers controls for the existing validator; it does not claim that every operator honours royalties.
- Metadata remains owner-changeable until frozen. Gallery images and traits are read from the NFT's current `tokenURI`; rarity filtering and scores use the current renderer's interface. No pre-minted token attributes are fabricated.

## Action coverage

| Surface | Contract calls |
| --- | --- |
| Mine | ERC20 `approve(nft, mintPrice)`, NFT `mint(nonce)` |
| My Veterans | NFT `setApprovalForAll(staking, true/false)`, staking `stake`, `unstake`, `refresh`, NFT `safeTransferFrom` |
| Claim | staking `claim`; pool `claimImd`, `claimEth`, `claimAll`, `syncImd`, `unwrapWeth`, `payTreasury`, `donate` |
| Owner setup | NFT `configure`, `setWeth`, `setRenderer`, `freezeMetadata`, `setTransferValidator`, `setAutomaticApprovalOfTransfersFromValidator`, `transferOwnership`, `renounceOwnership` |
| Validator setup | current modular validator `setRulesetOfCollection`, `applyListToCollection(address,uint48)` |

Protocol callbacks (`notifyReward`, `notifyImd`, `recordFirstSeen`, `onWeightChange`, `onERC721Received`) are called by contracts, not exposed as visitor transactions. Renderer methods are reads. The handoff is `evm_contracts`, without a launch token pool, so no swaps or liquidity controls are appropriate.

## Source layout

- `web/src/config.ts`: manifest loading, integrity verification, chain and wallet connectors.
- `web/src/rpc.ts`, `wallet-provider.ts`: bounded RPC fallback and runtime provider guards.
- `web/src/validator.ts`, `web/config/transfer-validator.json`: deployed modular validator interface and policy encoding.
- `web/src/chain.ts`: live reads, deployment/sibling checks, bounded collection scan, metadata decoding.
- `web/src/transactions.tsx`: review/simulation/signature/receipt states, transaction locks, replacement handling.
- `web/src/pow.ts` and `miner.worker.ts`: exact hash computation and cancellable mining.
- `web/src/Wallet.tsx`, `open-in.ts`: EIP-6963 picker, mobile app links, switch/add-chain behavior.
- `web/src/Mine.tsx`, `Gallery.tsx`, `Portfolio.tsx`, `Setup.tsx`: user and owner flows.
- `web/scripts/export.mjs`, `verify.mjs`: final manifest generation and independent inventory validation.
- `web/tests/`: reproducible tests and synthetic fixtures. They are not imported by the production application.

## External interfaces and attribution

The ERC20 interface is viem's standard `erc20Abi`. The validator interface in `web/config/transfer-validator.json` matches the deployed modular [CreatorTokenTransferValidator](https://github.com/limitbreakinc/creator-token-transfer-validator/tree/59adb8b36ab0256c7430b017b1c9f8b4841d6e1e), rather than the legacy interface in creator-token-standards. It is not an attested application ABI. The live validator address comes only from `getTransferValidator()`. Policy writes require supported runtime selectors, a compatible policy read and transaction simulation. [Current validation](WALLET-RPC-VALIDATION.md) records the exact methods, option mapping, runtime hash and successful read-only simulations on both public RPCs. The exported interface bytes are fixed in this submission; application ABI hashes remain unchanged.

Wallet integration follows the assignment's pinned reference and the official [wagmi configuration documentation](https://wagmi.sh/react/api/createConfig) and [Coinbase connector documentation](https://wagmi.sh/react/api/connectors/coinbaseWallet). Transaction preflight follows [viem simulation](https://viem.sh/docs/contract/simulateContract). The Rabby link uses `_cmd=open-dapp&dapp=...`, verified against [Rabby Mobile's universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts) and `/mobile/` production prefix on 2026-10-14.

Wallet marks were extracted from RainbowKit 2.2.11, with its MIT license included under `web/public/Wallet-Icons-LICENSE.txt`. The Coinbase mark follows the pinned wallet guide. Space Grotesk and IBM Plex Mono are bundled locally under their included OFL licenses. Better Interface guidance is adapted from Jakub Krehel's pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). Design documentation follows the pinned Impeccable method by Paul Bakaus at `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). The frontend UX checklist is adapted from Austin Griffith's ethskills at `06ea4efa0807` (MIT). The supplied license texts accompany these docs; the design document is an implementation-specific adaptation.

## Scope and publication

This repair changes only frontend source, tests, documentation and the static export. Contract
source, economics, existing build configuration, dependency manifests/lockfiles, ignore files,
vendored dependencies and workflows are unchanged. The final design specification is at
[DESIGN.md](../DESIGN.md).

The existing site name is `https://veterans-mine-your-legacy.sites.imd.fun`. The hosting pipeline
publishes the submitted `dist/` at that name; no separate publishing command was run. Relative
assets and hash navigation are retained for static hosting. Worker checks validate the local
export; they do not establish that the public URL has switched to this revision, future RPC
availability, marketplace compliance, native-wallet behavior or real signatures.
