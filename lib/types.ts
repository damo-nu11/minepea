/**
 * Central contract file (Convention 2, Data Layer in the project docs).
 *
 * Two layers:
 *  - WIRE TYPES: raw values only — this is the future API contract. A real
 *    backend will never send display strings, so none exist here.
 *  - VIEW MODELS: raw + `*Formatted` twins, produced by pure toViewModel()
 *    mappers in the hook/adapter layer. Components consume view models only.
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

export type Address = `0x${string}`;

/** Tile ids are 0–24, displayed as #1–#25. */
export type TileId = number;

/**
 * Round lifecycle (Convention 3): components render settlement states from
 * `phase`, never by inferring `timer === 0`.
 */
export type RoundPhase = "active" | "settling" | "settled";

// ─── Wire types (future API contract — raw values only) ─────────────────────

export interface TileWire {
  id: TileId;
  /** Total ETH deployed on this tile this round, wei as decimal string. */
  deployedWei: string;
  minerCount: number;
}

/** The engine's sole primitive: one deploy action by one miner. */
export interface DeployEventWire {
  /** Monotonic, stable — used as the React key in the miners feed. */
  id: number;
  roundId: number;
  miner: Address;
  minerName?: string;
  tiles: TileId[];
  /** Total wei for this deploy, spread evenly across `tiles`. */
  amountWei: string;
  /** Epoch ms. */
  at: number;
}

export interface RoundWire {
  roundId: number;
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms — the single clock authority for countdown AND settlement. */
  endsAt: number;
  phase: RoundPhase;
  /** Dense — always length 25. */
  tiles: TileWire[];
  totalDeployedWei: string;
  /** This round's jackpot, raw PEA units (18 dp) as decimal string. */
  motherlodePea: string;
  /** Set while phase is 'settling' | 'settled'. */
  winningTile: TileId | null;
  winner: Address | null;
  winnerName?: string;
  isSplit: boolean;
}

/** A settled round, as listed in Explore / LAST ROUND. */
export interface RoundSummaryWire {
  roundId: number;
  winningTile: TileId;
  /** null ⇒ winnings were split. */
  winner: Address | null;
  winnerName?: string;
  isSplit: boolean;
  winnerCount: number;
  /** Invariant: deployedWei = vaultedWei + winningsWei. Vaulted is the flat
   * 10% protocol fee, or 100% when the drawn tile had no miners on it. */
  deployedWei: string;
  vaultedWei: string;
  winningsWei: string;
  /** null ⇒ no motherlode hit this round. */
  motherlodePea: string | null;
  /** Epoch ms. */
  settledAt: number;
}

export interface PricesWire {
  peaUsd: number;
  ethUsd: number;
}

export interface BalancesWire {
  ethWei: string;
  peaWei: string;
}

export interface ProtocolStatsWire {
  maxSupplyPea: string;
  circulatingPea: string;
  buried7dPea: string;
  protocolRev7dWei: string;
}

// ─── View models (raw + formatted twins) ─────────────────────────────────────

export interface TileVM {
  id: TileId;
  /** "#1"–"#25" */
  label: string;
  eth: number;
  ethFormatted: string;
  minerCount: number;
}

export interface RoundVM {
  roundId: number;
  roundIdFormatted: string;
  startedAt: number;
  endsAt: number;
  phase: RoundPhase;
  tiles: TileVM[];
  totalDeployedEth: number;
  totalDeployedFormatted: string;
  motherlodePea: number;
  motherlodeFormatted: string;
  winningTile: TileId | null;
  winnerDisplay: string | null;
  isSplit: boolean;
}

/** One row of the MINERS live feed. */
export interface FeedItemVM {
  /** Stable monotonic id — React key. */
  id: number;
  roundId: number;
  address: Address;
  /** minerName if set, else shortened address. */
  display: string;
  tileCount: number;
  /** The tile ids this deploy covered — drives the hover popover mini-grid. */
  tiles: TileId[];
  eth: number;
  ethFormatted: string;
}

export interface RoundSummaryVM {
  roundId: number;
  roundIdFormatted: string;
  winningTile: TileId;
  /** "#N" — Explore table style. */
  tileLabel: string;
  /** "N" — bare number, LAST ROUND bar style. */
  tileNumber: string;
  /** Winner name/short address, or "Split". */
  winnerDisplay: string;
  /** Raw winner address (null on split rounds) — "YOU"/winner-row matching. */
  winner: Address | null;
  isSplit: boolean;
  winnerCount: number;
  /** Raw deployed ETH — Explore Mining-tab averages. */
  deployedEth: number;
  deployedFormatted: string;
  vaultedFormatted: string;
  /** Raw winnings in ETH — per-winner share math in the miner popover. */
  winningsEth: number;
  winningsFormatted: string;
  /** null ⇒ render the em-dash. */
  motherlodeFormatted: string | null;
  /** Epoch ms — relative time renders in a ticking leaf cell (Convention 4). */
  settledAt: number;
}

export interface PricesVM {
  peaUsd: number;
  peaUsdFormatted: string;
  ethUsd: number;
  ethUsdFormatted: string;
}

export interface ProtocolStatsVM {
  maxSupplyFormatted: string;
  circulatingFormatted: string;
  buried7dFormatted: string;
  protocolRev7dFormatted: string;
}

export interface BalancesVM {
  eth: number;
  ethFormatted: string;
  pea: number;
  peaFormatted: string;
}

// ─── Store + hook contracts (Data Layer in the project docs) ────────────────────────

/**
 * External-store seam consumed via useSyncExternalStore. getServerSnapshot()
 * must return a fixed deterministic world so SSR and first client render
 * match. Implemented by BOTH the mock engine and the Phase 9 API/SSE client.
 */
export interface Store<T> {
  subscribe(cb: () => void): () => void;
  getSnapshot(): T;
  getServerSnapshot(): T;
  /**
   * Server-corrected wall clock, for anything compared against a round's
   * endsAt. The device clock is not trustworthy for this: a machine a
   * minute fast locks the board while the round is still live, and one a
   * minute slow lets a user start a deploy that cannot land. Optional —
   * the mock engine's own clock is the truth there, so it does not
   * implement it and consumers fall back to Date.now().
   */
  serverNow?(): number;
}

/** The user's per-round game state (drives the Mine grid lock/highlight). */
export interface UserGameState {
  /** roundId the user deployed in, or null. Locks the grid for that round. */
  deployedRound: number | null;
  deployedTiles: TileId[];
  /** Auto-redeploy rounds remaining after the current one. */
  autoRemaining: number;
}

/** One settled round the connected user mined (newest first in the
 * store slice). Derived at SETTLEMENT from the round's events + summary
 * (never from claim state — plan reference/profile-plan.md §3); the live
 * backend will serve the same shape through the translate seam. */
export interface UserRoundWire {
  roundId: number;
  settledAt: number;
  /** no_winner = the drawn tile was uncovered; money-identical to lost
   * for the user, narratively distinct. */
  outcome: "won" | "lost" | "no_winner";
  /** Meaningful only on wins (the 1 PEA split coin flip). */
  isSplit: boolean;
  peapotHit: boolean;
  winningTile: TileId;
  tiles: TileId[];
  deployedWei: string;
  wonEthWei: string;
  /** The 1-PEA emission share only; the peapot rides separately. */
  wonPeaWei: string;
  peapotPeaWei: string;
  source: "manual" | "automine";
  /** Live mode only: the wallet covered the drawn tile but the on-chain
   * checkpoint has not landed, so the reward legs still read "0". Renders
   * as "won, reward pending" — NEVER as a loss (the rewards side of this
   * project already shipped that bug once). */
  rewardPending?: boolean;
}

/** Lifetime aggregates folded from the COMPLETE round log (mock) or
 * served by the backend (live). Raw values only. */
export interface UserTotalsWire {
  roundsPlayed: number;
  roundsWon: number;
  /** null when the backend has not computed it yet (its aggregates stay at
   * defaults until a one-off backfill runs) — renders as a dash, never 0. */
  peapotHits: number | null;
  totalDeployedWei: string;
  totalWonEthWei: string;
  totalWonPeaWei: string;
  bestRound: { roundId: number; netEthWei: string } | null;
  bestWinStreak: number;
  currentWinStreak: number;
  firstPlayedAt: number;
  asOfRoundId: number;
}

export interface UserRoundVM extends UserRoundWire {
  deployedEth: number;
  deployedFormatted: string;
  wonEth: number;
  wonEthFormatted: string;
  /** wonEth − deployed (signed). */
  netEth: number;
  netEthFormatted: string;
  /** Net as a return on the round's own stake; null when nothing was
   * deployed (never a divide-by-zero zero). */
  netPct: number | null;
  netPctFormatted: string;
  /** Emission + peapot combined for display. */
  wonPea: number;
  wonPeaFormatted: string;
  resultLabel:
    | "Won"
    | "Won split"
    | "Won, pending"
    | "Lost"
    | "No winner"
    | "—";
}

export interface UserTotalsVM {
  roundsPlayed: number;
  roundsWon: number;
  peapotHits: number | null;
  peapotHitsFormatted: string;
  winRatePct: number;
  winRateFormatted: string;
  totalDeployedEth: number;
  totalDeployedFormatted: string;
  netEth: number;
  netEthFormatted: string;
  totalWonPea: number;
  totalWonPeaFormatted: string;
  bestRound: { roundId: number; netEth: number; netEthFormatted: string } | null;
  bestWinStreak: number;
  currentWinStreak: number;
  firstPlayedAt: number;
  asOfRoundId: number;
}

export interface UserHistoryVM {
  rounds: UserRoundVM[];
  /** null until the user has at least one settled round. */
  totals: UserTotalsVM | null;
}

/** The full game snapshot every game store publishes. */
export interface EngineSnapshot {
  /** false only in the server/hydration snapshot. */
  bootstrapped: boolean;
  /** Set by real-data stores when the source is unreachable pre-bootstrap. */
  error?: boolean;
  /** True when the live stream has gone quiet for longer than a heartbeat
   * interval. `bootstrapped` is a one-way latch, so without this a dead
   * backend is indistinguishable from a healthy one and users can commit
   * funds against data the app knows is stale. Never set by the mock. */
  stale?: boolean;
  round: RoundWire;
  /** Append-only bounded log, monotonic ids — current + recent rounds. */
  feed: DeployEventWire[];
  /** Newest first. */
  history: RoundSummaryWire[];
  prices: PricesWire;
  protocolStats: ProtocolStatsWire;
  user: UserGameState;
  /** The connected user's settled rounds, newest first (profile page).
   * Slice ref changes only at settlement — selector-friendly. */
  userRounds: UserRoundWire[];
}

export interface DeployParams {
  miner: Address;
  /** Wei per tile, decimal string. */
  amountPerTileWei: string;
  tiles: TileId[];
  /** Total rounds to deploy for (1 = just this round). */
  rounds: number;
}

/** Action surface a game store may expose alongside Store<EngineSnapshot>. */
export interface GameActions {
  deploy(params: DeployParams): Promise<void>;
}

export type HookStatus = "loading" | "live" | "error";

/** Every read hook returns this; components must handle `undefined` data. */
export interface HookResult<T> {
  data: T | undefined;
  status: HookStatus;
}

// ─── Wallet stub API (Privy-shaped; internals replaced in Phase 9) ──────────

export type WalletStatus =
  "initializing" | "disconnected" | "connecting" | "connected";

export interface WalletApi {
  status: WalletStatus;
  address: Address | null;
  /** Async and rejectable — a real connect opens a modal the user can dismiss. */
  connect(): Promise<void>;
  disconnect(): void;
  /** Re-read balances from the source (viem RPC under Privy). Call after any
   * confirmed tx that moves value: a post-confirmation read returns the
   * chain's truth incl. gas, which optimistic math can never know. */
  refreshBalances(): void;
}
