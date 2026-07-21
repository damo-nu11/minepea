# PEA Build Plan

Phased build of the PEA frontend shell. Each phase is done when its boxes are checked **and** its visual gate passes (see Working Agreement at the bottom).

Palette: **Voltage** — pure black `#000000` / white / electric `#CCFF00`, lime hairlines, outline CTAs (moodboard option 03, chosen 2026-07-12; earlier: `#FFC800` gold, then `#CCFB5D` lime). Denomination: **ETH** (replaces the reference's SOL everywhere — icon, tickers, amounts; 0x hex addresses). Token: **PEA** (wordmark, glyph, tickers).

---

## Phase 0 — Scaffold & foundations ✅ (2026-07-11)
- [x] Next.js 16 + TypeScript + Tailwind v4 app scaffolded in this folder (App Router, no src dir, `@/*` alias, ESLint, git initialized) — React 19.2, vitest added
- [x] **Forbidden-terms pre-commit hook installed** — block-tested with a poisoned staged file; refuses when the terms list is missing
- [x] `app/globals.css`: full token set as `@theme` `--color-*` variables; dark reset; Inter via `next/font`; `tnum` + `micro-label` + `dashed-underline` utilities
- [x] `lib/format.ts` (fromWei, fmtToken, fmtUsd, fmtInt, fmtCompact, fmtPct, fmtRoundId, fmtCountdown, relTime, shortAddr → `0xAbCd...WxYz`) + unit tests (16 at phase close; 18 after audit pins)
- [x] `lib/types.ts`: wire types (RoundWire with `endsAt`+`phase`, TileWire, DeployEventWire, RoundSummaryWire, Prices/Balances/ProtocolStats) + view models + store contract + wallet stub API
- [x] Icon set in `components/icons.tsx` (16 glyphs at phase close; 18 after Phase 8 added shield+gift), all `currentColor`
- [x] PEA wordmark SVG — verified in browser (`npm run build`, lint, tests all green)

## Phase 1 — Shared chrome ✅ (2026-07-11)
- [x] Wallet stub context (`lib/wallet.tsx`): full status ladder, async rejectable `connect()` (600ms), ~300ms fake init; fake ETH+PEA balances via separate async `useBalances()` (400ms) — ladder verified in browser
- [x] `Header`: wordmark → nav → tickers (static placeholders; Phase 2 wires live) → socials → Connect pill. Active underline verified on Stake + docs child pages (hamburger carries it for dropdown children)
- [x] Nav dropdown — dark panel, outside-click + Escape close, verified open/close in browser
- [x] All 7 routes exist with H1 + subtitle shells (original copy); navigation verified end-to-end; all static-prerender in build
- [x] Tooltip primitive (hover + keyboard focus; consumed from Phase 3 on)

## Phase 2 — Mock game engine ✅ (2026-07-11)
- [x] Event-sourced engine (`lib/mock/engine.ts`): deploy events sole primitive; tiles/DEPLOYED/feed/winners/history derived via `settleRound()`; injectable `{ seed, now() }`; no module-scope side effects — ticks lazy-start on first subscribe, stop on last unsubscribe; `SERVER_SNAPSHOT` deterministic empty world
- [x] 60s rounds keyed off `endsAt` + `phase: active|settling|settled` (verified by fake-timer tests: settles at endsAt, rolls after SETTLING_MS)
- [x] 400-miner pool (hex 0x addresses + 6 display names), ~250 deploys/round; invariant `deployed = vaulted + winnings` (vaulted ~9.5%) asserted across all 60 seeded rounds; reference-scale (winners ~130–180, ~8–16 ETH/round)
- [x] `deploy({miner, amountPerTileWei, tiles, rounds})`: 500ms latency, rejectable (double-deploy/inactive round), merges into tiles+feed, locks round, auto-redeploys N rounds — all unit-tested
- [x] Motherlode pot grows per round, ~1/40 hit recorded in history, resets on hit
- [x] History: 60 settled rounds fast-forwarded through the same generate→settle path
- [x] Prices random walk; header tickers live (observed ticking in browser)
- [x] Hooks (`lib/hooks/useGame.ts`): useRound / useRoundTimer (leaf-only, derives from endsAt) / useMinersFeed (append-only, monotonic ids) / usePrices / useRoundHistory / useUserGameState — all `{ data, status }`
- [x] Seam test: fixture store renders through the hooks with zero component diffs (`useGame.test.tsx`)

## Phase 3 — Mine page (the centerpiece) ✅ (2026-07-11)
- [x] Viewport-height two-pane layout (`h-[calc(100dvh-60px)]`, overflow-hidden; MINERS scrolls in sidebar)
- [x] 5×5 grid: ghost contents, 2px accent selected, deployed tint, winner highlight, hover brighten, click/drag multi-select
- [x] Stats strip DEPLOYED | MOTHERLODE (accent) | TIME (red leaf countdown), hairline dividers
- [x] LAST ROUND bar (navy gradient, winner display incl. Split, chevron → /explore)
- [x] Lite/Pro toggle + inert gear w/ tooltip; Lite = amount+chips+Deploy across all 25
- [x] Amount block (dot-matrix + ghost numeral input + ETH glyph)
- [x] Chips +0.01/+0.1/+1/MAX (balance-derived); TILES (ALL + steppers ↔ grid sync); ROUNDS steppers; PER ROUND computed
- [x] Deploy ladder verified in browser: disabled → enabled → Deploying... → **Deployed w/ 25 gold-locked tiles**
- [x] MINERS feed streaming (avatar/address/tiles/ETH) + styled empty state
- [x] Settlement from `phase` (winner highlight observed live; motherlode hit observed: pot 143.4 → 24.2)
- [ ] Visual gate vs S1 — **deferred to joint Phase 8 pass with user**

## Phase 4 — Stake page ✅ (2026-07-11)
- [x] Centered column: H1 + Liquid pill (tooltip); Deposit/Withdraw toggle (withdraw readout = staked PEA); amount block + `N PEA` balance readout; 25/50/75/MAX chips; CTA ladder w/ pending states (local simulated staking)
- [x] Summary: APR / Deposits / TVL (dashed labels + tooltips; TVL live off PEA price)
- [ ] Visual gate vs S3 — deferred to joint Phase 8 pass

## Phase 5 — Trade page ✅ (2026-07-11)
- [x] Swap/Schedule toggle (Schedule = "coming soon" stub panel)
- [x] Pay block (ghost numeral + ETH selector w/ chevron), percent chips, RECEIVE row + PEA token chip, CTA ladder
- [x] Token selectors: 2-item ETH/PEA list, picking other token flips direction
- [x] Quote math live off engine prices (ETH↔PEA cross rate)
- [ ] Visual gate vs S5 — deferred to joint Phase 8 pass

## Phase 6 — Explore page ✅ (2026-07-11)
- [x] 4-stat row (MAX SUPPLY / CIRCULATING SUPPLY / BURIED (7D) / PROTOCOL REV (7D)) via useProtocolStats
- [x] H2 `Mining` + Rounds ⚡ / Motherlodes ✦ segmented control + original caption copy
- [x] Rounds table (9 cols, Split pill, ETH-icon values, ticking RelTime leaf cells) — invariant visible in rendered data; rows non-clickable (recorded deviation)
- [x] Motherlodes table variant + styled empty state
- [ ] Visual gate vs S2 — deferred to joint Phase 8 pass

## Phase 7 — Docs ✅ (2026-07-11)
- [x] `docs/[slug]` static (generateStaticParams): intro, mining, staking, tokenomics, links — **all original PEA copy** in lib/docsContent.tsx
- [x] Right mini-TOC (white active rule segment, route-derived, ≥lg widths) + Next/Prev pager
- [ ] Visual gate vs S4 — deferred to joint Phase 8 pass

## Phase 8 — Stubs, polish, responsive ✅ (2026-07-11)
- [x] Rewards + Shield "coming soon" treatment (ComingSoon component, Gift/Shield icons)
- [x] Support FAB (left-edge tab, speech bubble, inert w/ tooltip, ≥md)
- [x] Tooltip copy on all dashed-underline labels (LAST ROUND/TILES/ROUNDS/PER ROUND/MINERS/APR/Deposits/TVL/Liquid/gear)
- [x] Responsive pass, CSS breakpoints only: Mine stacks below lg (viewport-lock desktop-only); header collapses nav into dropdown below md, tickers ≥lg, socials ≥xl; Connect pill scales; feed max-h on mobile — verified at 1290px and 375px
- [x] Stake Summary labels mixed-case per spec transcription (decision recorded)
- [x] Forbidden-terms sweep clean (content + filenames)
- [x] Side-by-side at 1290px: Mine + Stake verified against S1/S3 (structural match); full-page pass continues in the deep audit

## Phase 9 — Web3 integration seams ✅ code-complete (2026-07-12) — runtime verification pending credentials
- [x] Privy: real `@privy-io/react-auth` provider (`lib/walletPrivy.tsx`) behind `NEXT_PUBLIC_PRIVY_APP_ID`; same shared wallet context as the stub; balances via viem RPC (+ optional PEA ERC-20). **Runtime flow unverified — needs a Privy dashboard app id from the user**
- [x] Real data layer: `lib/api/gameStore.ts` (REST + SSE) implements the same `Store<EngineSnapshot>` + `GameActions` seam behind `NEXT_PUBLIC_API_URL`; endpoint contract documented in the project docs; 13 unit tests with injected fetch/EventSource fakes (grown by audit rounds). **Live-backend verification pending — no backend exists yet**
- [x] `.env.example` — all switches optional; zero-credential local build unchanged (verified: mock mode runs identically)
- [ ] On-chain tx flows (deploy/stake/swap) — blocked on deployed contracts; action seam is `useEngineActions().deploy`
- [ ] Round-detail views — still de-scoped (see Architecture Notes)

---

## Product changes after Phase 9 (2026-07-12, user-directed)
- Trade, Rewards, and Shield pages removed (components + routes + icons + tests). Historical phase entries above (5, and parts of 1/8) describe them as built — accurate at the time; superseded by this change.
- Nav restructured: flat top bar Mine / Stake / About / Explore — hamburger dropdown removed entirely; all links visible at every width.

---

### Working agreement
- Build in phase order; check boxes as things land. PLAN.md boxes = phase progress truth; the project docs Integration Status = per-component data-source truth; update Integration Status first, then check the box.
- **Visual gate** (per page-phase): compare in the in-app browser against the matching screenshot at reference width — layout metrics within ~4px of ui-spec, every ui-spec §9 interaction for that page demonstrated; any accepted delta is logged in the project docs Architecture Notes before the box is checked.
- Any spec deviation or product decision goes into the project docs (Architecture Notes / Open Product Questions) at the moment it's made.

## Phase 11 — Live backend + on-chain integration ✅ code-complete (2026-07-16)
- [x] `ApiGameStore` rewritten to the real api.minepea.com protocol (FRONTEND_INTEGRATION_MAP.md): bootstrap = round/current + deploys hydration (current+prev) + rounds + price; SSE `deployed`/`roundTransition`; VRF-lag phase synthesis + 8.2s reveal hold (endsAt re-anchor); txHash feed dedupe; `setAddress` identity bridge — 16 store tests + 10 translator tests on captured fixtures
- [x] `UserDataProvider` (lib/user): per-user SSE + strict-rate-limited rewards/staking/automine trio (throttled, never polled) → useRewards/useStakingPosition/useAutomine + toast wiring (components/Toast.tsx)
- [x] Tx layer: lib/abi (minimal viem ABIs — legacy contract names confined there), lib/tx (clients, simulate→sign→receipt runner with revert decoding, autoMinerMath replicating the contract's hybrid-fee deposit derivation from source + 6 unit tests, deploy/claim/staking hooks)
- [x] MinePage deploy CTA → GridMining.deploy (1 round) / AutoMiner.setConfig (multi-round, fee disclosure rows + stop/refund control); ProfilePanel live portfolio + Rewards claims (checkpoint-first); StakePage live variant (approve→deposit, withdraw, pending-yield claim, live pool stats)
- [x] lib/contracts.ts single source (Robinhood Chain 4663 + public RPC + addresses); Privy supportedChains/defaultChain; forbidden-terms pre-commit hook reinstalled (scripts/githooks, core.hooksPath)
- [x] Verified live in browser against api.minepea.com: grid/stats/countdown/feed/history/tickers/staking summary; null-price guards; 108 tests + build + lint green
- [ ] Live tx verification (deploy/AutoMiner/claims/stake) — **blocked on NEXT_PUBLIC_PRIVY_APP_ID**; runs with per-tx user confirmation once available
- [ ] Explore analytics tabs stay SIMULATED until the backend analytics endpoints land

## Phase 10 — Explore v2: Blockworks-style analytics (2026-07-13)
- [x] Analyzed all 23 reference screenshots (full inventory in reference/explore-v2-plan.md §1)
- [x] Comprehensive plan written (reference/explore-v2-plan.md) + 31-agent adversarial plan audit; 20 confirmed findings folded in as §4 amendments
- [x] `lib/mock/analytics.ts` — seeded deterministic bundle, engine-pinned terminals (7 unit tests)
- [x] SVG chart kit (`components/charts/`): LineChart (crosshair, xFmt, area) + BarChart (stacked ±, overlays) — no third-party libs/iframes (no-attribution requirement)
- [x] ExplorePage v2: hero (stats rail + rescaled-to-live price chart) + tabs Mining (default, LIVE) | Buybacks | Token | Staking | Miners; SIMULATED tags on all mock charts
- [x] Smoke test rewritten per audit; 79 tests green
- [ ] Design pass with user (mock data on screen — iterate)
- [ ] Phase B/C wiring when endpoints exist (per-round pot endpoint is NEW backend surface; GeckoTerminal OHLCV w/ currency=usd for price)
