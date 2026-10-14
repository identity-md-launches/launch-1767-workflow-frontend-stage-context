# VETERANS design system

## Overview

VETERANS is a mining and staking application for collectors using the deployed contracts on Robinhood Chain. The visual direction is a dark mining terminal with green action accents, gold Overclocked artwork, pixel miner portraits, and readable data. The mining control comes before explanatory content. The artwork sits beside it on desktop and follows it on phones.

The implementation is intentionally dark-only. There is no inactive theme switch. Illustrative portraits on the Mine page establish the theme; actual token artwork in the gallery comes from on-chain metadata. Reuse the existing controls and data patterns rather than adding decorative panels around every group.

This document lives under `docs/` because the assignment's explicit write scope prohibits creating a root file.

## Colors

The source of truth is `web/src/styles.css`, beginning at `:root`. Colors use hexadecimal primitives and semantic role aliases.

| Token | Value | Role |
| --- | --- | --- |
| `--color-page` / `--ink-950` | `#101511` | Page and input background |
| `--color-surface` / `--ink-900` | `#18201a` | Main console, wallet dialog, claim panels |
| `--color-hover` / `--ink-800` | `#202b22` | Neutral controls and selected navigation |
| `--color-border` / `--ink-700` | `#36443a` | Structural dividers and control boundaries |
| `--color-text` | `#f0f3e9` | Primary text |
| `--color-muted` | `#a8b4a8` | Secondary text and labels |
| `--color-accent` / `--leaf-300` | `#b8ee75` | Primary action and brand highlight |
| `--color-accent-hover` / `--leaf-400` | `#a4db62` | Primary action hover |
| `--color-on-accent` | `#16210d` | Text and icons on green fills |
| `--color-gold` / `--sand-300` | `#e8cb83` | Overclocked rarity and the final age tier |
| `--color-warning-bg` | `#312b19` | Setup/network notices |
| `--color-error` / `--color-error-bg` | `#ffb4a9` / `#38241f` | Persistent errors |
| `--color-focus` | `#d8fbb2` | Two-pixel keyboard focus outline |

Art uses its own SVG palette; those colors do not become component tokens. State always has a text label as well as color. The rendered contrast probe and accessibility results are recorded in `docs/VALIDATION.md`; no contrast measurement for an unrendered state is implied.

## Typography

`web/src/fonts.css` bundles two local WOFF2 fonts. Space Grotesk Variable supplies weights 300–700; the interface uses 400, 600, and 700. IBM Plex Mono is loaded at 400 and used for amounts, hashes, progress numbers, and concise terminal output. The fallback stacks are `Arial, sans-serif` and `monospace`.

| Token | Size | Use |
| --- | --- | --- |
| `--text-xs` | 12px | Captions, compact labels, narrow navigation, addresses |
| `--text-sm` | 14px | Buttons, supporting UI text, forms' labels |
| `--text-base` | 16px | Body copy and all input/select text |
| `--text-lg` | 20px | Section titles and large data |
| `--text-xl` | 28px | Reward balances and the age section title |
| `--text-display` | 48px desktop; 36px at ≤640px | Page headline |

The headline is weight 700 with a 1.08 line-height and −0.05em tracking. Section headings are weight 600 with a 1.3 line-height and −0.02em tracking. Body copy uses 1.55 and is capped at 72 characters. Inputs stay at 16px on mobile. Headings balance their wrapping; prose uses `text-wrap: pretty`. Dynamic numbers use tabular numerals. Full addresses and hashes wrap with `overflow-wrap: anywhere`; important values are not clipped to fit.

## Layout

The main and footer containers are at most 1,264px including their horizontal padding. The header is at most 1,328px. Default horizontal padding is 32px, reduced to 24px below 900px and 16px below 640px; the main uses 12px below 360px. Repeated spacing steps are 4, 8, 12, 16, 20, 24, 28, 32, and 44/48px for larger groups.

The desktop Mine layout uses `minmax(0, 1.35fr) minmax(0, 1fr)` with a 24px gap. The header keeps navigation between the logo and wallet control until it needs a second row. At 900px, navigation occupies its own row. At 640px, the console precedes the portrait, navigation uses five compact icon/label controls, and the network badge is omitted because the network remains available in wallet/setup UI. The mining action stays visible on the first 390×844 screen.

Gallery columns adapt from four to three at 900px and two at 640px. Filters become a two-column row with search spanning the width. Claim and setup grids collapse to one column. Wallet-age data changes from three columns to stacked rows. Full addresses wrap next to their copy controls. There is no page-level horizontal overflow masking; reflow is handled with flexible grids, `min-width: 0`, and wrapping.

Breakpoints are 1150, 900, 640, and 360px. The final export was checked at 320, 390, 900, and 1440px, including synthetic large balances and owner addresses. Phone viewport emulation is not a physical-device test.

## Elevation & Depth

The interface uses flat tonal surfaces and borders, without card shadows or gradient text. The console has a structural border. Its terminal activity region uses horizontal separators rather than a nested card. Most statistics are grouped with spacing and shared rules.

The portrait frames use borders and small rotations as part of the artwork composition. They are not interactive panels. Native `<dialog>` elements render on the browser top layer with a dark translucent backdrop (`#080d0ad9`). Dialogs become bottom sheets at 640px while remaining modal, keyboard accessible, and scrollable within 90dvh.

## Shapes

The shared surface radius is 12px; control radius is 6px. Wallet dialogs use 16px, with only the top corners rounded on phones. The brand mark and token images use 8px corners. The small network chip is pill-shaped. Primary action buttons have at least 44px targets. Compact navigation, the header wallet control, address copy buttons, and native checkboxes use smaller targets with surrounding spacing; the rendered home-page probe passed its 24px-or-spacing baseline.

## Components

| Component or pattern | Source | Reuse and behavior |
| --- | --- | --- |
| `Icon` | `web/src/components.tsx` | One local SVG set, `currentColor`, 1.7px strokes, decorative icons hidden from assistive technology |
| `Metric` | `web/src/components.tsx` | Label, tabular amount, optional explanation; never a fake zero during loading |
| `Notice` | `web/src/components.tsx` | Neutral, warning, or error surface; errors use alert semantics |
| `AddressLink` | `web/src/components.tsx` | Full checksum address, explorer link, copy control, copy-failure guidance |
| `Modal` | `web/src/components.tsx` | Native dialog with title and close button; Escape/backdrop dismissal, focus containment and return |
| `.button`, `.primary`, `.text-button` | `web/src/styles.css` | Neutral action, green primary action, or underlined secondary action; visible hover/focus/disabled states |
| `Wallet` | `web/src/Wallet.tsx` | Single header connect/switch/account control; named providers, mobile app rows, pending/rejection feedback |
| `useTransactions` | `web/src/transactions.tsx` | Review dialog with effect, target address, network, estimated fee, simulation, and irreversible acknowledgement; distinct per-action state through receipt/refetch |
| `TokenCard` | `web/src/Gallery.tsx` | Actual metadata image, trait detail dialog, optional selection checkbox; unmined cards clearly marked and noninteractive |
| `RegistryControl` | `web/src/Gallery.tsx` | Explicit scan, progress, cancellation, error and refresh controls |
| `WalletAge` | `web/src/Portfolio.tsx` | First-seen age, current tier, and recorded weight displayed separately |

Buttons have 120ms background/color/press transitions only when reduced motion is not requested. Press scale is 0.96. There are no endless animations or animated page entrances. Mining counters update without blinking; a visible pause button stops the worker. Focus indicators use `:focus-visible`; forced colors use the system highlight. Every form control has a visible label and every icon-only action has an accessible name.

## Do's and Don'ts

- Start another section with `.page-heading` and the existing shared container. Put the task and its actionable state above explanation.
- Use `Metric` for live quantities and show a dash/loading message before reads complete. Distinguish received, allocated, claimable, and balance values.
- Use one emphasized green action in an active task area. Leave alternative actions neutral.
- Reuse token roles. Gold indicates the rarity/final-tier theme; it is not a substitute for a primary button.
- Keep important IDs, addresses, amounts, and transaction errors available in full. Allow long values to wrap.
- Keep simulation and account/network guards in `useTransactions`; styling must not bypass disabled state or expose another signing path.
- Preserve the native dialog and input behavior. Do not add bespoke keyboard widgets where the platform already supports the interaction.
- Do not add remote font calls, a marketing hero above the mining action, unminted token traits, or invented financial estimates.

To add a page, register its hash navigation, reuse the container, heading, and metric patterns, connect reads through the existing runtime, and route writes through `useTransactions`. Check the 320/390px layouts and keyboard flow, then rebuild the static export and inventory.
