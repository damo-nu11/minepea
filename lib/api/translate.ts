/**
 * Pure translators: live-backend response shapes → the frontend wire types
 * (lib/types.ts). The ONLY place that knows the backend dialect exists —
 * ApiGameStore orchestrates, these convert. See FRONTEND_INTEGRATION_MAP.md
 * for the field-level contract and backend/API.md for captured responses.
 *
 * Dialect rules handled here:
 * - roundId arrives as a STRING on live endpoints/SSE, a number on Mongo-
 *   backed ones — always coerced with Number().
 * - Round times are unix SECONDS on live endpoints (×1000 here); Mongo-backed
 *   responses use ISO strings (Date.parse here).
 * - "blocks" ⇄ "tiles"; "peapot" ⇄ "motherlode"; peapotAmount "0" ⇒ null
 *   (no hit); zero-address ⇒ null winner.
 * - Raw amounts only — the backend's *Formatted twins are ignored.
 */

import { EMPTY_TILES } from "@/lib/gameSnapshot";
import type {
  Address,
  DeployEventWire,
  RoundSummaryWire,
  RoundWire,
  TileId,
  TileWire,
  UserRoundWire,
  UserTotalsWire,
} from "@/lib/types";

// ─── Backend response shapes (captured 2026-07-16, backend/API.md) ──────────

export interface BackendBlock {
  id: number;
  deployed: string;
  minerCount: number;
}

export interface CurrentRoundResponse {
  roundId: string;
  /** Unix seconds. */
  startTime: number;
  endTime: number;
  totalDeployed: string;
  peapotPool: string;
  settled: boolean;
  blocks: BackendBlock[];
  userDeployed?: string;
  /** Attached only after the round settled (before the next starts). */
  winner?: {
    winningBlock: number;
    topMiner: string;
    totalWinnings: string;
    topMinerReward: string;
    peapotAmount: string;
    isSplit: boolean;
  };
}

export interface BackendDeploy {
  /** Present on the REST deploys endpoint; ABSENT inside the SSE `deployed`
   * payload's deploy{} (the event carries the user top-level — live root
   * cause 2026-07-17: assuming it existed threw and killed the grid update). */
  user?: string;
  /** Decoded tile ids — no client-side bitmask math. */
  blocks: number[];
  blockMask: string;
  amountPerBlock: string;
  /** Present on the REST deploys endpoint; MISSING from the SSE `deployed`
   * payload's deploy{} (observed live 2026-07-17) — derived when absent. */
  totalAmount?: string;
  isAutoMine: boolean;
  txHash: string;
  /** ISO string. */
  timestamp: string;
}

export interface RoundDeploysResponse {
  roundId: number;
  count: number;
  deploys: BackendDeploy[];
}

/** One round from /api/rounds or /api/round/:id (Mongo-backed). */
export interface BackendRound {
  roundId: number;
  settled: boolean;
  /** ISO string. */
  settledAt: string;
  winningBlock: number;
  isSplit: boolean;
  topMiner: string;
  /** null ⇒ the PEA reward was split. */
  peaWinner: string | null;
  peapotAmount: string;
  totalDeployed: string;
  totalWinnings: string;
  vaultedAmount: string;
  winnerCount: number;
}

export interface RoundsResponse {
  rounds: BackendRound[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface PriceResponse {
  /** null until DexScreener indexes the pair. */
  pea: { priceUsd: string | number } | null;
}

/** SSE `deployed` on /api/events/rounds. */
export interface DeployedEventPayload {
  roundId: string;
  /** null during a webhook outage (rpc-poller fallback). */
  user: string | null;
  totalDeployed: string;
  userDeployed?: string;
  blocks: BackendBlock[];
  /** null during a webhook outage — skip the feed item, grid still applies. */
  deploy: BackendDeploy | null;
}

/** SSE `roundTransition` on /api/events/rounds. */
export interface RoundTransitionPayload {
  /**
   * null ⇒ the round was empty (no reveal). Newer backend payloads
   * (2026-07-17) send a zeros OBJECT for empty rounds instead, marked by
   * `winnerCount: null` — treat that the same as null.
   */
  settled: {
    roundId: string;
    winningBlock: number;
    topMiner: string;
    totalWinnings: string;
    topMinerReward: string;
    peapotAmount: string;
    isSplit: boolean | null;
    /** Enriched payload (2026-07-17): null ⇒ truly empty round. */
    winnerCount?: number | null;
    peaWinner?: string | null;
  } | null;
  newRound: {
    roundId: string;
    /** Unix seconds. */
    startTime: number;
    endTime: number;
    peapotPool: string;
  };
}

// ─── Translators ─────────────────────────────────────────────────────────────

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** Zero address ⇒ null (split rounds report topMiner as the zero address). */
function addrOrNull(addr: string | null | undefined): Address | null {
  if (!addr || addr.toLowerCase() === ZERO_ADDR) return null;
  return addr as Address;
}

/**
 * Amounts are decimal wei strings per the API contract, but the backend's
 * rpc-poller fallback path has been OBSERVED (2026-07-16, live SSE) emitting
 * raw hex ("0x...") in roundTransition payloads. Normalize at the boundary —
 * downstream invariants (`peapotAmount !== "0"`, display math) assume decimal.
 */
function wei(value: string | null | undefined): string {
  if (!value) return "0";
  if (value.startsWith("0x") || value.startsWith("0X")) {
    try {
      return BigInt(value).toString();
    } catch {
      return "0";
    }
  }
  return value;
}

/** Dense 25-tile array from backend blocks (defensive against gaps/order). */
export function toTiles(blocks: BackendBlock[]): TileWire[] {
  const tiles = EMPTY_TILES.map((t) => ({ ...t }));
  for (const b of blocks) {
    if (b.id >= 0 && b.id < 25)
      tiles[b.id] = {
        id: b.id,
        deployedWei: wei(b.deployed),
        minerCount: b.minerCount,
      };
  }
  return tiles;
}

export function toRoundWire(body: CurrentRoundResponse, now: number): RoundWire {
  const endsAt = body.endTime * 1000;
  return {
    roundId: Number(body.roundId),
    startedAt: body.startTime * 1000,
    endsAt,
    // Settlement is VRF-driven and can lag endTime by minutes — past endsAt
    // the round is "settling" even before the backend marks it settled.
    phase: body.settled || now >= endsAt ? "settling" : "active",
    tiles: toTiles(body.blocks),
    totalDeployedWei: wei(body.totalDeployed),
    motherlodePea: wei(body.peapotPool),
    winningTile: body.winner ? body.winner.winningBlock : null,
    winner: body.winner ? addrOrNull(body.winner.topMiner) : null,
    isSplit: body.winner?.isSplit ?? false,
  };
}

/** Fresh RoundWire from a roundTransition's newRound (zeroed grid). */
export function toNewRoundWire(
  newRound: RoundTransitionPayload["newRound"],
): RoundWire {
  return {
    roundId: Number(newRound.roundId),
    startedAt: newRound.startTime * 1000,
    endsAt: newRound.endTime * 1000,
    phase: "active",
    tiles: EMPTY_TILES,
    totalDeployedWei: "0",
    motherlodePea: wei(newRound.peapotPool),
    winningTile: null,
    winner: null,
    isSplit: false,
  };
}

export function toDeployEventWire(
  deploy: BackendDeploy,
  roundId: number,
  id: number,
  /** SSE deploy{} carries no user — the caller passes the top-level one. */
  fallbackMiner?: string | null,
): DeployEventWire {
  // Older SSE payloads also omitted totalAmount — derive when absent.
  const amountWei =
    deploy.totalAmount !== undefined
      ? wei(deploy.totalAmount)
      : (
          BigInt(wei(deploy.amountPerBlock)) * BigInt(deploy.blocks.length)
        ).toString();
  return {
    id,
    roundId,
    miner: (deploy.user ?? fallbackMiner ?? ZERO_ADDR).toLowerCase() as Address,
    tiles: deploy.blocks,
    amountWei,
    at: Date.parse(deploy.timestamp) || 0,
  };
}

export function toRoundSummaryWire(round: BackendRound): RoundSummaryWire {
  return {
    roundId: Number(round.roundId),
    winningTile: round.winningBlock,
    winner: addrOrNull(round.peaWinner),
    isSplit: round.isSplit,
    winnerCount: round.winnerCount,
    deployedWei: wei(round.totalDeployed),
    vaultedWei: wei(round.vaultedAmount),
    winningsWei: wei(round.totalWinnings),
    // "0" ⇒ no peapot hit this round ⇒ null (renders the em-dash).
    motherlodePea: wei(round.peapotAmount) !== "0" ? wei(round.peapotAmount) : null,
    settledAt: Date.parse(round.settledAt) || 0,
  };
}

/**
 * The current round with a roundTransition's settlement applied — the winner
 * reveal state. `endsAt` is re-anchored to `now`: settlement is VRF-driven
 * and can arrive minutes after the original endTime, and MineGrid anchors
 * its elimination animation to `endsAt` — without the bump the reveal would
 * snap instantly.
 */
export function withSettlement(
  round: RoundWire,
  settled: NonNullable<RoundTransitionPayload["settled"]>,
  now: number,
): RoundWire {
  return {
    ...round,
    phase: "settling",
    winningTile: settled.winningBlock,
    // Enriched payloads carry the PEA winner directly; older ones only the
    // top miner (zero address ⇒ null either way).
    winner: addrOrNull(settled.peaWinner ?? settled.topMiner),
    isSplit: settled.isSplit === true,
    endsAt: now,
  };
}

/** null pea object (no DexScreener pair yet) ⇒ 0 — consumers render "—". */
export function toPeaUsd(body: PriceResponse): number {
  if (!body.pea) return 0;
  const price = Number(body.pea.priceUsd);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

// ─── Per-user history (GET /api/user/:address/history?type=deploy) ──────────

export interface BackendRoundResult {
  settled: boolean;
  /** null while unsettled. */
  outcome: "won" | "lost" | "no_winner" | null;
  isSplit: boolean;
  /** The wallet covered the drawn tile — true even before the on-chain
   * checkpoint lands, which is why rewards can still read "0" here. */
  wonWinningBlock: boolean;
  peapotHit: boolean;
  winningBlock: number;
  settledAt: string;
  ethWon: string;
  /** Combined leg, kept for older callers; we read the two below. */
  peaWon: string;
  /** Round emission share, GROSS (the 10% harvest fee is charged at claim). */
  peaWonMining: string;
  /** Jackpot share, "0" when none fired. Independent of the mining leg. */
  peaWonPeapot: string;
  pnl: string;
}

export interface BackendHistoryEntry {
  roundId: number;
  user: string;
  amountPerBlock: string;
  /** Decimal STRING bitmask of the 25 tiles — decoded here. */
  blockMask: string;
  totalAmount: string;
  txHash: string;
  isAutoMine: boolean;
  /** ISO. */
  timestamp: string;
  roundResult?: BackendRoundResult | null;
}

export interface BackendHistoryTotals {
  totalETHWon: string;
  totalPEAWon: string;
  totalETHDeployed: string;
  totalPNL: string;
  peaPriceEth: number | null;
  roundsPlayed: number;
  roundsWon: number;
  peapotHits: number;
  bestWinStreak: number;
  currentWinStreak: number;
  /** netEthWei is SIGNED: a wallet that never profited still reports its
   * least-bad round. */
  bestRound: { roundId: number; netEthWei: string } | null;
  firstPlayedAt: string | null;
  asOfRoundId: number;
}

export interface UserHistoryResponse {
  history: BackendHistoryEntry[];
  /** null for a wallet that has never mined (NOT a row of zeros). */
  totals: BackendHistoryTotals | null;
  pagination: { page: number; limit: number; total: number; pages: number };
}

/** Decimal bitmask string → ascending tile ids. */
export function tilesFromMask(mask: string): TileId[] {
  let m: bigint;
  try {
    m = BigInt(mask);
  } catch {
    return [];
  }
  const tiles: TileId[] = [];
  for (let i = 0; i < 25; i++) if ((m >> BigInt(i)) & 1n) tiles.push(i);
  return tiles;
}

/**
 * One settled history row → our wire shape.
 *
 * Returns null for a row whose round has not settled: the profile shows
 * settled rounds only, and an in-flight deploy has no outcome to report.
 *
 * THE CHECKPOINT RULE (backend's own warning, and the shape of a bug this
 * project already shipped once on the rewards side): rewards populate only
 * after the on-chain checkpoint, so a genuine win can arrive as
 * `wonWinningBlock: true` with ethWon and peaWon both "0". That is "won,
 * reward pending" — never a loss. The outcome enum is preserved as sent and
 * `rewardPending` carries the distinction to the UI.
 */
export function toUserRoundWire(
  e: BackendHistoryEntry,
): UserRoundWire | null {
  const r = e.roundResult;
  if (!r || !r.settled || r.outcome === null) return null;
  const ethWon = r.ethWon ?? "0";
  const peaMining = r.peaWonMining ?? "0";
  const peaPeapot = r.peaWonPeapot ?? "0";
  return {
    roundId: e.roundId,
    settledAt: Date.parse(r.settledAt),
    outcome: r.outcome,
    isSplit: r.isSplit === true,
    peapotHit: r.peapotHit === true,
    winningTile: r.winningBlock,
    tiles: tilesFromMask(e.blockMask),
    deployedWei: e.totalAmount,
    wonEthWei: ethWon,
    wonPeaWei: peaMining,
    peapotPeaWei: peaPeapot,
    source: e.isAutoMine ? "automine" : "manual",
    rewardPending:
      r.wonWinningBlock === true &&
      ethWon === "0" &&
      peaMining === "0" &&
      peaPeapot === "0",
  };
}

/** Backend lifetime aggregates → our wire shape. */
export function toUserTotalsWire(
  t: BackendHistoryTotals,
): UserTotalsWire {
  return {
    roundsPlayed: t.roundsPlayed,
    roundsWon: t.roundsWon,
    peapotHits: t.peapotHits,
    totalDeployedWei: t.totalETHDeployed,
    totalWonEthWei: t.totalETHWon,
    totalWonPeaWei: t.totalPEAWon,
    bestRound: t.bestRound,
    bestWinStreak: t.bestWinStreak,
    currentWinStreak: t.currentWinStreak,
    firstPlayedAt: t.firstPlayedAt ? Date.parse(t.firstPlayedAt) : 0,
    asOfRoundId: t.asOfRoundId,
  };
}
