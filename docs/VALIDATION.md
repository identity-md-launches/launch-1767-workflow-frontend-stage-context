# Frontend validation

Validation was performed on 2026-10-14 against the production static export. This is worker-generated evidence, not an independent certification or evidence of future publication. No real transaction was signed or broadcast.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript and Vite production build | Passed after the final source changes | `npm --prefix web run build` includes `tsc --noEmit` |
| Node tests | 9 passed | `web/tests/core.test.ts` |
| Production browser interactions | 29 passed; no uncaught script errors | [interactions.json](evidence/interactions.json) |
| Pinned design probe | 16 of 16 passed | [taste.json](evidence/taste.json) |
| Rendered axe accessibility scan | Zero reported violations across six sections | [accessibility.json](evidence/accessibility.json) |
| Public chain checks | Both configured RPCs returned chain 4663 and nonempty contract code | [chain-check.json](evidence/chain-check.json) |
| Export integrity | 24 assets, 916,450 asset bytes; both attested ABI hashes match | [export-check.json](evidence/export-check.json) |
| Static subpath hosting | Built app loaded under `/preview/`, with relative assets and hash navigation | Browser suite and [local-resources.json](evidence/local-resources.json) |
| Allowed paths | Only `web/`, `dist/`, and `docs/` additions; no dependency/cache directories or submodules | [scope-check.json](evidence/scope-check.json) |
| Git change bundle | Under 1 MiB against the 8 MiB limit, with the pinned deployed commit as prerequisite | [bundle-check.json](evidence/bundle-check.json) |

The manifest is generated last, excludes itself from the inventory, and uses only the permitted top-level fields. The complete contract set, source commit, launch ID, chain ID, attestation, network, and wallet-add-chain data match the preserved handoff inputs. This handoff has no pool key. All seven exported ABI arrays are inventoried; the two attested application ABIs additionally match their canonical Keccak hashes. The 24 assets are well below the 128-file limit, and the export is below the publication response budget. Dependencies and browser downloads are not part of the export or submission.

The final application build and browser suite ran together after the last source change. The design probe and read-only chain check were then repeated against that export. Subsequent changes were documentation/evidence only. Reproduction commands, from the repository root:

```sh
npm ci --prefix web
npm --prefix web run build
npm --prefix web test
PLAYWRIGHT_BROWSERS_PATH=/tmp/veterans-playwright npm --prefix web run test:browser
npm --prefix web run check:chain
npm --prefix web run verify
IMD_PLAYWRIGHT=./web/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/veterans-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The worker installed dependencies with npm and Chromium into the disposable `/tmp/veterans-playwright` directory. `npm ci` above is the lockfile-based reproduction step, not a claim that a second clean install was performed. The pinned probe input is removed by the assignment after validation; its resulting report is preserved here. The browser suite owns and closes its HTTP server and Chromium instance.

## Interaction coverage

Tests exercised the actual bundled UI and mining worker using synthetic RPC responses and an EIP-6963 wallet. The mock uses a lower PoW difficulty for speed and validates the submitted nonce against the exact chain/contract/wallet hash. It does not replace the production miner with a fake proof.

- Connection: disconnected guards; named wallet discovery; suppression of the generic injected-wallet row; connection rejection; four mobile wallet links; Coinbase Smart Wallet choice; wrong-chain state; a 4902 response followed by the exact supplied add-chain parameters and a second switch.
- Mining: exact one-mint approval, rejection recovery, simulation before signing, locking through receipt and refetch, actual background proof, stale-proof revert, successful mint state refresh, pause and account-change cancellation, and auto-mine preparing another proof without automatic signing. Sold-out supply and incompatible token decimals prevent approvals and mining.
- Holdings and rewards: explicit ownership scan, staking approval, selecting and staking a token, unstaking, and separate staking IMD, pool IMD, pool ETH, and combined pool claims. Leaderboard reads use the deployed sibling interfaces.
- Gallery: all 3,333 numbered slots, token-number search, actual metadata shape, rarity/Overclocked filtering, and unmined placeholders without invented traits.
- Owner controls: input validation, configuration bound to the discovered siblings, and separate acknowledgement before irreversible metadata freeze. Other owner and maintenance controls received source/ABI review but were not all driven through a successful mocked transaction.
- Recovery: both public RPCs failing with connected-wallet fallback; disconnected RPC failure and retry; tampered ABI rejection before write controls load; an uncertain receipt holding the write lock until manual confirmation succeeds.
- Layout and keyboard: all six sections at 320, 390, and 1440px, including maximum-size uint256 balances and full owner addresses; skip link preserving the current hash route; native dialog dismissal and focus restoration.

Unit coverage independently checks packed proof binding and target comparison, canonical ABI hashing, bigint amount precision, address validation, readable errors, mobile links, and unknown-chain handling. Tests intentionally do not verify contract economics by copying their implementation; deployed contract behavior is preserved and described in [FRONTEND.md](FRONTEND.md).

## Rendered inspection

The browser inspection used Chromium and the production site with live public reads. The main mining control was visible at `y=528.64`, height `48`, on the 390×844 viewport, alongside the product, wallet control, and mining state. The viewport and document widths both measured 390px. At 900px they both measured 900px. These are viewport-emulation observations, not measurements from physical phones.

- [390px live first screen](evidence/mine-mobile-live.jpg) and [measured mobile layout](evidence/mobile-layout.json)
- [1440px live full page](evidence/mine-desktop-live.jpg)
- [Keyboard-focused wallet dialog](evidence/wallet-keyboard.jpg) and [focus-return result](evidence/keyboard.json)
- [900px layout measurement](evidence/tablet-layout.json)
- [390px synthetic connected state](evidence/mine-mobile-mocked.jpg), clearly separate from live-chain evidence

The live page showed the actual unconfigured deployment, zero minted supply, and a disabled mining action with setup guidance. Local fonts and assets loaded. The browser and pinned probe reported no uncaught script errors or missing local resources. The probe found no horizontal overflow at 320/390/1440, text overlap, clipped text, or floating controls covering text. Its measured text met 4.5:1 contrast, or 3:1 for large text. The modal was opened with Enter and dismissed with Escape; focus returned to its trigger.

## Better Interface review

The pinned Better Interface workflow and core principles in all six domains were read and applied during implementation, followed by a source and rendered review. The final design tokens, typography, components, and breakpoints are documented in [DESIGN.md](DESIGN.md).

| Domain | Applied and checked | Limits / not applicable |
| --- | --- | --- |
| Accessibility | Semantic headings/navigation/forms; visible input labels; accessible icon names; native dialog and focus return; persistent status/errors; skip link; visible focus and forced-color treatment; reduced-motion rules; axe scan on six sections | No screen-reader session, physical touch-device test, or native browser zoom audit. Probe's 17 home controls passed 24px-or-spacing; seven remain below the preferred 44px size. |
| Layout | Main action first on mobile; shared containers and spacing; flexible grids; full-address wrapping; narrow-width tests on all sections; maximum balance fixtures; native modal sizing | No RTL/localized text audit or physical-device safe-area check. |
| Writing | Short task-led headings, action labels, nearby prerequisite/error guidance, explicit approval/mint distinction, clearly named token units, actual configuration status | No invented USD conversion; its absence is explained. Financial figures are contract units and qualified estimates. |
| Typography | Two local font families; six-size scale; three weights; headline heaviest; tabular figures; 16px form inputs; no tracked small-cap eyebrows | Only the shipped Latin/English interface was reviewed. |
| Colors | Semantic CSS tokens; single green primary-action role; gold rarity treatment; text as well as color for state; rendered contrast checks | Dark-only is intentional. Contrast measurements cover rendered states, not every possible dynamic error or external SVG metadata image. |
| UI | Native controls; deliberate disabled/loading/empty/error/success states; explicit scans; stoppable mining; review, simulation and receipt phases; irreversible acknowledgement; wallet missing-chain recovery | No swaps: this is an application-contract handoff without a launch pool. No remote asset dependency for UI chrome. |

### Findings and repairs

Locations refer to the final source, where the repairs can be inspected.

| Finding | Location | Repair and verification |
| --- | --- | --- |
| Desktop artwork caption and gallery link overlapped in the first design probe | `web/src/styles.css:577` | Removed the link's float/negative placement and let it flow with the caption. Final layout probe passed; desktop screenshot reviewed. |
| Console output looked like a second card inside the mining panel | `web/src/styles.css:354` | Replaced the inner filled rounded box with transparent output and horizontal separators. Final chrome probe reports zero cards inside cards. |
| A submitted transaction could become uncertain when receipt lookup failed | `web/src/transactions.tsx:113` | Retain the outstanding transaction and write lock, expose its explorer link and a manual confirmation check. Browser recovery test passed. |
| Approval could be offered after supply exhaustion or against unexpected mint-token units | `web/src/Mine.tsx:34`, `web/src/Mine.tsx:136` | Require remaining supply and the expected token metadata before approval/mining. Both boundary tests passed. |
| Auto-mine needed to respect a changed checkbox and account while confirmation was pending | `web/src/Mine.tsx:27`, `web/src/Mine.tsx:45` | Read the latest auto preference, clear queued work when disabled, and terminate/discard wallet-bound work when context changes. Auto/pause/account tests passed. |
| Hash navigation could be disturbed by the skip link | `web/src/App.tsx:116` | Focus the main region without replacing the current page hash. Keyboard test passed. |

The initial design probe passed 14 of 16 checks. After the two design repairs, the final probe passed all 16. It measured two font families, weights 400/600/700, no repeated copy, no tracked heading eyebrows, no looping animations, no `transition: all`, and the required sharing metadata. First-screen prose measured 23 words at 390px and 41 at 1440px. No failed first-screen or repeated-page finding remains in the recorded probe.

## Live-chain and publication limits

Both configured public RPCs were read on 2026-10-14 at the time recorded in the chain evidence. They agreed on chain ID, contract code, sibling addresses, owner, renderer, mint price, difficulty, and unconfigured IMD/WETH settings. The zero addresses in that evidence are actual contract return values, not configuration substitutes. The UI offers the connected owner setup controls; WETH requires an owner-supplied address, and no WETH address was guessed. The worker did not configure either token or change any on-chain state.

No funded live mint, staking, claim, donation, transfer, validator, or owner transaction was attempted. Simulation and browser mocks do not establish that these will succeed with a particular wallet balance, future chain state, or external validator policy. Real extension approval screens, mobile deep-link handoff, Coinbase passkey creation, hardware mining performance, and marketplace royalty enforcement remain untested. Gallery scanning was exercised with a small synthetic minted collection and a live supply of zero; a complete 3,333-minted collection was not performance-tested. Firefox, Safari, native 200% zoom, and screen readers were not tested.

The site has no server requirement. Open Graph title, description, favicon, and local image are present; absolute Open Graph URLs await a published domain. IPFS pinning, fixed-CID and named-entrypoint checks, and publication-time RPC/code verification are subsequent control-plane work and are not claimed as completed here.

The task's explicit write budget excludes root files. Consequently, the requested design specification is delivered as `docs/DESIGN.md` instead of root `DESIGN.md`. Source, lockfile, build configuration, tests, and the explicitly allowed ignore file are under `web/`; static assets are under `dist/`; documentation and durable evidence are under `docs/`. Existing deployed source and root build configuration were not changed.

The requested commit could not be created in the task checkout: `git add web dist docs` returned `Unable to create .../.git/index.lock: Read-only file system`. No repository permission was changed or approval requested. The deliverable files remain available for the submission controller to collect. Bundle size and staging-path checks use a disposable verification repository under the explicitly permitted `test/scratch/`; its commit is validation scaffolding, not a commit in the task checkout.

The bundle check includes all frontend source, lockfile, export, and evidence changes, with deployed source commit `d3de6035fe432600d7f669ba8104e1ba4bbb37be` as its Git prerequisite. A bundle including all historical commits could not be made because the supplied partial checkout lacks historical object `98bf7a853cbdbc3792caf035ec31bbdeb6a6113e`; attempting to retrieve it also encountered the read-only object store. No historical source was deleted or substituted. The measured change bundle and temporary verification repository are disposable validation artifacts, not additional frontend packaging.
