# VETERANS implementation and deployment notes

This frontend targets the already deployed application at source commit `d3de6035fe432600d7f669ba8104e1ba4bbb37be`, launch `18d391e8-b53a-4f70-b9f3-3419fd6b8a48`, chain ID **4663**. The runtime source of truth is [`dist/imd-deployment.json`](../dist/imd-deployment.json).

## Verified deployment binding

| Contract | Attested address | Canonical Keccak ABI hash |
| --- | --- | --- |
| VeteransRenderer | `0x52aaebf6aabe67b182eca14e3df52601b92765b7` | `c5d6bbfa9dcc1b80975836519faad81910fb60355590b3fc5be20afd7bee29b2` |
| VeteransNFT | `0x582ea0b5c023f354e0b95bfcb5c12a2062e8e033` | `bd4ea42d960ad5325217e55b740355d492ca2e55d62efd0d1d4d72c0e6742643` |

The canonical hash recursively sorts object keys, preserves array order, encodes compact JSON as UTF-8, then computes Keccak-256 without an `0x` prefix. The exporter obtains each raw ABI array from `git show <sourceCommit>:docs/abi/<Contract>.json`; the two attested hashes were verified before implementation and during every build. Staking, pool, and unwrapper ABIs come from the same source commit. They appear as hashed assets, without adding unattested contracts to the manifest's contract set.

At the recorded read-only check, `VeteransNFT.staking()` returned `0x5d675D359f72902E0066146846730531F594b23B` and `claimPool()` returned `0x3Ad9BBDAc6058C14c44b530881ED38c32aF8e5d1`. These are documentation snapshots, not browser configuration. The browser resolves and verifies the siblings from the NFT on every new session. Both configured RPCs returned chain 4663 and nonempty code for the attested contracts and siblings. Exact observations and check time are in [chain-check.json](evidence/chain-check.json).

## Deployed behavior reflected in the UI

- The live deployment was **not configured for IMD or WETH** at validation time, with zero NFTs minted. The frontend exposes owner setup and disables unavailable actions. No deployment configuration was changed by this worker.
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
| Validator setup | current validator `setTransferSecurityLevelOfCollection`, `applyListToCollection` |

Protocol callbacks (`notifyReward`, `notifyImd`, `recordFirstSeen`, `onWeightChange`, `onERC721Received`) are called by contracts, not exposed as visitor transactions. Renderer methods are reads. The handoff is `evm_contracts`, without a launch token pool, so no swaps or liquidity controls are appropriate.

## Source layout

- `web/src/config.ts`: manifest loading, integrity verification, chain, RPC fallback, wallet connectors.
- `web/src/chain.ts`: live reads, deployment/sibling checks, bounded collection scan, metadata decoding.
- `web/src/transactions.tsx`: review/simulation/signature/receipt states, transaction locks, replacement handling.
- `web/src/pow.ts` and `miner.worker.ts`: exact hash computation and cancellable mining.
- `web/src/Wallet.tsx`, `open-in.ts`: EIP-6963 picker, mobile app links, switch/add-chain behavior.
- `web/src/Mine.tsx`, `Gallery.tsx`, `Portfolio.tsx`, `Setup.tsx`: user and owner flows.
- `web/scripts/export.mjs`, `verify.mjs`: final manifest generation and independent inventory validation.
- `web/tests/`: reproducible tests and synthetic fixtures. They are not imported by the production application.

## External interfaces and attribution

The ERC20 interface is viem's standard `erc20Abi`. The extra validator ABI is a small read/write interface derived from Limit Break's public [CreatorTokenTransferValidator implementation](https://github.com/limitbreakinc/creator-token-standards/blob/main/src/utils/CreatorTokenTransferValidator.sol) and [TransferPolicy struct](https://github.com/limitbreakinc/creator-token-standards/blob/main/src/utils/TransferPolicy.sol), consulted on 2026-10-14. It is not represented as an attested application ABI. The live validator address comes only from `getTransferValidator()`. Policy writes require a successful compatible policy read and transaction simulation. This interface source is subject to upstream changes; the exported ABI bytes are fixed in this submission.

Wallet integration follows the assignment's pinned reference and the official [wagmi configuration documentation](https://wagmi.sh/react/api/createConfig) and [Coinbase connector documentation](https://wagmi.sh/react/api/connectors/coinbaseWallet). Transaction preflight follows [viem simulation](https://viem.sh/docs/contract/simulateContract). The Rabby link uses `_cmd=open-dapp&dapp=...`, verified against [Rabby Mobile's universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts) and `/mobile/` production prefix on 2026-10-14.

Wallet marks were extracted from RainbowKit 2.2.11, with its MIT license included under `web/public/Wallet-Icons-LICENSE.txt`. The Coinbase mark follows the pinned wallet guide. Space Grotesk and IBM Plex Mono are bundled locally under their included OFL licenses. Better Interface guidance is adapted from Jakub Krehel's pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). Design documentation follows the pinned Impeccable method by Paul Bakaus at `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). The frontend UX checklist is adapted from Austin Griffith's ethskills at `06ea4efa0807` (MIT). The supplied license texts accompany these docs; the design document is an implementation-specific adaptation.

## Scope and publication

The explicit write budget allows only `web/**`, `dist/**`, `docs/**`, and `web/.gitignore`. Therefore the requested design specification is delivered at **`docs/DESIGN.md`**, not the prohibited root `DESIGN.md`. Root build files, contract source, dependencies under `lib/`, and workflow configuration remain untouched.

No public site URL or CID was supplied or created. Open Graph assets use relative paths; a publisher can add absolute URLs once the hosting name exists, then regenerate the entire manifest. Worker tests do not certify future gateway publication, RPC availability, marketplace enforcement, actual hardware performance, or wallet signatures. Publication's immutable/named-copy, RPC-code, and hash checks remain the control plane's responsibility.
