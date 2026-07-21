# Frontend Integration Map — live backend (api.minepea.com) ↔ components

**STATUS: fully integrated (2026-07-17).** Every page runs on live backend + on-chain
data in API mode; the mock/simulation shell still runs with zero env vars. This doc maps
each endpoint/SSE event to its consumer with field-level translations, and records the
as-built adapter behaviors. Contract source of truth: backend/API.md.
Supersedes BACKEND_DATA_REQUIREMENTS.md.

**Architecture (as built):** all game data flows through one seam —
`Store<EngineSnapshot>` + hooks. `lib/api/gameStore.ts` is the live adapter; only it and
`lib/api/translate.ts` know the backend dialect. Per-wallet data (rewards/staking/
automine + per-user SSE) lives in `lib/user/userData.tsx`. Explore analytics live in
`lib/api/analyticsLive.ts` + `components/explore/LiveTabs.tsx`. On-chain writes live in
`lib/tx/` over minimal ABIs in `lib/abi/` (the ONLY place legacy contract names may
appear). Chain + contract addresses: `lib/contracts.ts` (edit there on redeploy).

**Adapter defenses (each earned by a live incident):**
- Phase synthesis: `active → "settling"` at `endsAt` via a local 500ms timer
  (settlement is reset()-driven and can lag minutes).
- Winner reveal: on settlement, patch winner fields + **re-anchor `endsAt` to now**
  (MineGrid's animation timeline hangs off endsAt), hold the next round `SETTLING_MS`
  (8.2s). Works from EITHER path — SSE transition or recovery poll — whichever learns
  of the settlement first; the loser of the race must not restart the animation.
- Stale-round recovery: while settling, re-poll `/api/round/current` every 10s; adopt
  newer rounds (with reveal, if ours had deploys), refresh same-round grids (missed
  `deployed` events), backfill feed + history for skipped rounds.
- Heartbeat watchdog: the stream heartbeats every 30s — 90s of silence ⇒ recycle the
  EventSource (silent stream deaths fire no error event).
- Hex normalization (`wei()` in translate.ts): amounts may arrive as `"0x…"`.
- Feed ids: client-assigned monotonic, **deduped by `txHash` BEFORE id assignment**
  (hydration/SSE/backfill overlap must not duplicate React keys).
- Lifecycle: epoch guard (StrictMode), latest-bootstrap-only seq, merge-not-replace
  bootstrap, monotonic roundId guards, `sseTouchedUser` shield.

---

## 1. Dialect map

| Frontend | Backend | Notes |
|---|---|---|
| tile / `TileId` 0–24 | block / `blockId` 0–24, `blockMask` bitmask | mask bit *n* = block *n*; 33554431 = all 25 |
| `motherlodePea` (wire) / PEAPOT (UI) | `peapotPool`, `peapotAmount` | raw PEA 18dp strings |
| Harvested / Unharvested (UI) | `roasted` / `unroasted` | backend "roasting" = frontend "harvesting" |
| `winner` (PEA winner, null = split) | `peaWinner` | `topMiner` = largest deployer (zero-address on split) — different concept |
| epoch **ms** | unix **seconds** (round/current, SSE `newRound`) / **ISO** (Mongo-backed) | per-endpoint conversion |
| `roundId: number` | string on live endpoints/SSE, number on Mongo-backed | `Number()` everywhere |
| raw wei decimal strings | raw (sometimes **hex**) + `*Formatted` twins | `wei()` normalizes; Formatted ignored |
| — | lowercase addresses | all address compares lowercased |

## 2. Bootstrap: REST → `EngineSnapshot`

Parallel legs, per-leg partial apply; only round/current flips `bootstrapped`.

- **`round` ← `GET /api/round/current?user=`** — roundId `Number()`, times ×1000,
  `blocks→tiles`, `peapotPool→motherlodePea`, phase synthesized (`settled || now>=endsAt
  ⇒ "settling"`), post-settle `winner{}` → winningTile/winner/isSplit.
- **`history` ← `GET /api/rounds?settled=true&page=1&limit=60`** — `winningBlock→
  winningTile`, `peaWinner→winner` (null=split), `peapotAmount "0"→null` (em-dash),
  ISO `settledAt` parsed. Client cap 120.
- **`feed` ← `GET /api/round/:id/deploys`** for current + previous round (MINERS shows
  the latest round WITH deploys). REST deploy rows include `user`+`totalAmount`;
  ids client-assigned, txHash-deduped.
- **`prices` ← `GET /api/price`** (then 30s poll) — `pea` null until DexScreener indexes
  the pair ⇒ `peaUsd 0` ⇒ every USD figure renders "—" (never "$0.00"). `ethUsd` comes
  from the client-side Coinbase overlay, not the backend.
- **`user`** — `userDeployed>0 ⇒ deployedRound=current`; `deployedTiles` from own deploys
  in the hydration; re-derived on `setAddress` (identity bridge from UserDataProvider).
- **Balances** — viem reads over `CHAIN`/`RPC_URL` from lib/contracts.ts (public
  Robinhood RPC default); PEA via `CONTRACTS.peaToken` balanceOf.
- `protocolStats` — left zeroed (no consumer; Explore-v1 leftover).

## 3. SSE — global `GET /api/events/rounds`

Heartbeat 30s; server closes at 60min; every `open` re-runs the bootstrap; watchdog
recycles a silent stream after 90s.

- **`deployed`** — full 25-block snapshot: replace `tiles`+`totalDeployedWei` wholesale
  (aggregate of ALL miners). Feed item from `deploy{}` — ⚠️ **`deploy{}` carries NO
  `user`** (top-level only — passing it in is the fix for the silent-grid live bug) and
  `totalAmount` may be absent (derived = amountPerBlock × blocks) or hex (normalized).
  `deploy: null` on poller-fallback broadcasts ⇒ skip the item (backfill recovers it).
  Feed-item construction is try/isolated — it can never cost the grid patch. Top-level
  `user` == connected wallet ⇒ lock the grid (covers AutoMiner `deployFor` too). Events
  for a round AHEAD of ours ⇒ buffer grid + trigger recovery.
- **`roundTransition`** — enriched settled object: `{roundId, winningBlock, topMiner,
  totalWinnings, topMinerReward, peapotAmount, isSplit, peaWinner?, winnerCount?}`.
  **Empty round = `settled: null` OR a zeros object with `winnerCount: null`** ⇒ roll
  immediately, no reveal, no history row. Real settlement on the visible round ⇒ reveal
  (unless one is already running from the recovery path — then only advance the rollover
  target, never backward) + fetch `/api/round/:id` for the authoritative history row +
  backfill that round's deploys. `newRound` applied after the hold (any buffered
  `deployed` grid for it applied at rollover).
- **`yieldDistributed`** — ignored by the game store (staking data is UserDataProvider's).
- **`heartbeat`** — liveness only (feeds the watchdog).

## 4. SSE — per-user `GET /api/user/:address/events` (UserDataProvider)

Open on connect, close on disconnect/switch. All consumers BUILT:

| Event | Consumer (as built) |
|---|---|
| `checkpointed` | toast + **payload direct-applied** (adds ethReward/peaReward to pending, recomputes 10% fee, clears uncheckpointedRound) + trueing refetch |
| `claimedETH` / `claimedPEA` | success toast + **pending zeroed instantly from the event** + trueing refetch |
| `autoMineExecuted` | toast + local rounds-remaining decrement + automine refetch → MinePage AutoMiner row |
| `configDeactivated` / `stopped` | toast (refund amount) + automine refetch |
| `stakeDeposited` / `stakeWithdrawn` | toast + `newBalance` applied directly from payload → StakePage/Profile |
| `yieldClaimed` / `yieldCompounded` | toast + staking refetch |
| `heartbeat` | ignore |

No per-rollover rewards refetch (removed 2026-07-17 — auto-advancing rounds drained the
shared strict pool and 429-starved post-claim refreshes). Wins land via `checkpointed`
(the next deploy auto-checkpoints; AutoMiner deploys every round).

## 5. Writes — all on-chain (lib/tx/, no REST writes)

All txs: simulate (decoded revert pre-signature) → sign via the wallet's EIP-1193
provider (`ensureChain` switches/adds Robinhood 4663) → wait receipt. Errors toast with
friendly copy; success feedback arrives via SSE (except approve/setConfig — local toast).

| Action | Call | Notes |
|---|---|---|
| Deploy (ROUNDS=1) | `GridMining.deploy(blockIds)` payable, value = perTile × count | MIN_DEPLOY 0.0000025 ETH/tile; auto-checkpoints the previous round |
| Deploy (ROUNDS>1) | `AutoMiner.setConfig(2, rounds, numBlocks, blockMask)` payable | **always Select (strategyId 2)** — a full-grid mask is valid Select; deposit from `lib/tx/autoMinerMath.ts` (BigInt replica of the contract's hybrid pct/flat fee derivation, verified against source); fee + total-deposit disclosure rows in the CTA; blocked while a config is active (stop first) |
| Stop AutoMiner | `AutoMiner.stop()` | MinePage row: "AutoMiner active — N rounds left · Stop · refund Ξx" |
| Claim ETH / PEA | `claimETH()` / `claimPEA()` (`CLAIM_PEA_FN` in lib/abi/gridMining.ts) | ProfilePanel Rewards; runs `checkpoint(roundId)` FIRST automatically when `uncheckpointedRound` is set (claims stay enabled in that state even at 0 pending) |
| Stake / Withdraw / Yield | `Staking.deposit/withdraw/claimYield` | deposit needs prior `peaToken.approve` (two-step CTA); deposit sends `value: 0` (msg.value = compound-fee reserve, not stake) |

## 6. Page-by-page (all LIVE in API mode; mock shell intact without env vars)

| Surface | Source |
|---|---|
| Header PEA / ETH tickers | `/api/price` (dash until listing) / Coinbase overlay |
| Mine grid, stats, countdown, reveal | round/current + `deployed` + `roundTransition` + recovery |
| Mine MINERS feed | deploys hydration + SSE (latest round with deploys; `fmtTokenSmart` keeps tiny amounts visible) |
| Mine LAST ROUND bar | history[0] |
| Mine deploy CTA | GridMining / AutoMiner txs |
| Explore hero | PEA/USD design slot with awaiting-listing state (price/MCap/FDV light up when the pair is indexed; real OHLCV series wiring lands with the listing); supplies + deployed totals live from analytics |
| Explore Mining tab | live tables (rounds/peapots) + analytics `mining` charts + **peapot sawtooth** (`series.peapot`, per-ROUND `{roundId,pot,hit}` — the one non-daily series) + **Refining APY** (`token → series.roasting`; null APR = gap, never zero) |
| Explore Buybacks / Token / Staking / Miners | `/api/analytics/{buyback,financials,token,staking,mining,behaviour}` — envelope accessors in analyticsLive.ts; ETH/PEA denomination until price feed |
| Stake page | `/api/staking/stats` (60s poll) + `/api/staking/:address` + txs + SSE |
| Profile drawer | Staked/Harvested/Unharvested + Rewards claims (`/api/staking/:address`, `/rewards`) |
| Not yet surfaced | `/api/leaderboard/earners`, `/api/user/:address/history` (activity page), `/api/user/:address/profile` (Supabase 503 — localStorage fallback), `/api/profiles/batch` |

## 7. Fetch discipline

| When | Calls |
|---|---|
| Page load | round/current(+`?user=`), deploys ×2, rounds, price; analytics tabs on Explore (60s client cache) |
| Wallet connect | rewards + staking + automine, once each (strict; 4s anti-burst spacing; SSE payloads direct-apply so refetches only true up) |
| While settling | round/current every 10s (recovery; poll-safe endpoint) |
| Always (API mode) | price every 30s; heartbeat watchdog check every 500ms tick |
| On 429 | silent retry 61s later (no error state if stale data exists) |
| Never | polling strict endpoints; `/api/webhook/events` |

## 8. Backend issues — status

1. ~~Stale round/current cache~~ **FIXED + verified live** (frontend recovery poll kept
   as cheap insurance; removable once trust is established — user's call).
2. ~~Duplicate roundTransition w/ hex from poller~~ **FIXED + verified** (single
   transition, decimals).
3. ~~Slow settlement~~ **not a bug** — manual reset() during testing.
4. **Solo winner recorded as Split** (`winnerCount 1, isSplit true, peaWinner null`) —
   fix claimed, **not yet re-verified** against a fresh solo win. Check LAST ROUND after
   the next all-25 settle shows the address, not "Split"/"—".
5. ~~Hex in deployed/checkpointed (webhook path)~~ **FIXED + verified** (frontend
   normalization stays as belt-and-braces).
6. `deploy{}.totalAmount` absent vs doc — frontend derives it; harmless either way.
7. Strict rate limiter is ONE shared 5/min pool across all four strict endpoints
   (`strictLimiter` in app.js) — frontend budgets around it, but per-endpoint limiters
   (or a raised test limit) recommended.

## 9. Remaining open items

- **Live tx verification of claims + AutoMiner cycle** (T4–T6): user-driven, per-tx
  confirmation. Deploy flow verified live; claims/AutoMiner/staking txs still pending
  a live run.
- **PEA/USD price series** for the hero chart — wire GeckoTerminal/DexScreener OHLCV
  once the pair is indexed (`PEA_ETH_LP_ADDRESS` is a Uniswap v4 pool id).
- ~~**Docs/About copy sweep**~~ RESOLVED (user, 2026-07-20): emission is
  **1.1 PEA per round, 0.1 of it to the PEAPOT, every round**. The
  "1.3 mint / 0.3 pot / winner rounds only" figures here were wrong; the
  site's copy was right all along. Docs, Explore and both legal documents
  already state 1.1/0.1 and need no change. Do not reintroduce 1.2 or 1.3.
- **Zerion double connect-prompt** — Privy connector × Zerion quirk (connect +
  requestPermissions rendered as two prompts); reproduce on demo.privy.io → report
  upstream. One-time per site authorization; not app code.
- **Production launch checklist**: edit `lib/contracts.ts` addresses; keep backend/.env
  + quicknode-stream-filter in sync; revisit keeper cadence; consider removing the
  recovery poll once SSE is proven sole-authority-reliable.
