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
  TileWire,
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
