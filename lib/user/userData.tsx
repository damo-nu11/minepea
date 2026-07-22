"use client";

/**
 * UserDataProvider — everything the backend knows about the CONNECTED wallet
 * (integration build 2026-07-16). Mounted inside the wallet provider; inert
 * in mock mode or while disconnected, so the zero-credential build and the
 * test suite never touch the network.
 *
 * Owns, per connected address:
 * - The identity bridge into the game store (`store.setAddress`, duck-typed
 *   — the mock engine simply has no such method).
 * - The per-user SSE stream GET /api/user/:address/events (claims,
 *   checkpoints, AutoMiner runs, staking moves) → toasts + targeted refresh.
 * - The strict-rate-limited REST trio (5/min per IP — NEVER polled):
 *     /api/user/:address/rewards   → useRewards()
 *     /api/staking/:address        → useStakingPosition()
 *     /api/automine/:address       → useAutomine()
 *   Fetched once per connect/SSE-open and after relevant events, behind an
 *   in-flight dedupe + MIN_REFETCH_MS trailing throttle (StrictMode double
 *   effects and event bursts can't burn the budget).
 *
 * Terminology (user 2026-07-18): backend "roasted/unroasted" = user-facing
 * "harvested/unharvested". The internal refined/unrefined field names stay,
 * same convention as the motherlode and apySeries keys.
 *
 * The hooks return {data:undefined,status:"loading"} when the provider is
 * absent (unit tests mount panels without it) or inert — components render
 * their placeholder state, same as the shell did.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/components/Toast";
import { IS_API_MODE, useEngineStore } from "@/lib/engineContext";
import { fmtToken, fromWei } from "@/lib/format";
import { createPublicClient, http } from "viem";
import { gridMiningAbi } from "@/lib/abi/gridMining";
import { CHAIN, CONTRACTS, RPC_URL } from "@/lib/contracts";
import type { Address, HookResult } from "@/lib/types";
import { useWallet } from "@/lib/walletContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
/** Anti-burst guard only (StrictMode double-effects, event bursts). The old
 * 20s floor made post-claim values lag; claims/checkpoints now direct-apply
 * their SSE payloads and refetches merely TRUE UP, so a short floor is safe
 * — steady-state strict usage is ~2/min even with auto-advancing rounds. */
const MIN_REFETCH_MS = 4_000;
/** Rewards poll. Matches the ~60s round cadence: a settled round is the only
 * thing that changes this slice without an event reaching us. */
const REWARDS_POLL_MS = 60_000;

// ─── View models ─────────────────────────────────────────────────────────────

export interface RewardsVM {
  pendingEthWei: string;
  pendingEth: number;
  pendingEthFormatted: string;
  /** Backend "unroasted" — mined PEA not yet claimed. */
  unrefinedPeaWei: string;
  unrefinedPea: number;
  unrefinedPeaFormatted: string;
  /** Backend "roasted" — bonus yield earned by holding unclaimed PEA. */
  refinedPeaWei: string;
  refinedPea: number;
  refinedPeaFormatted: string;
  /** What a claim actually pays out (after the 10% refining fee). */
  netPeaWei: string;
  netPea: number;
  netPeaFormatted: string;
  feePeaFormatted: string;
  /** A round whose rewards exist on-chain but need checkpoint() first. */
  uncheckpointedRound: number | null;
}

export interface StakingPositionVM {
  stakedWei: string;
  staked: number;
  stakedFormatted: string;
  pendingYieldWei: string;
  pendingYield: number;
  pendingYieldFormatted: string;
  canCompound: boolean;
}

export interface AutomineVM {
  active: boolean;
  strategyId: number;
  numRounds: number;
  roundsExecuted: number;
  roundsRemaining: number;
  selectedBlocks: number[];
  amountPerBlockWei: string;
  costPerRoundWei: string;
  costPerRoundFormatted: string;
  totalRefundableWei: string;
  totalRefundableFormatted: string;
  executorFeeBps: number;
  executorFlatFeeWei: string;
}

// ─── Backend → VM translators ────────────────────────────────────────────────

interface RewardsResponse {
  pendingETH: string;
  pendingPEA: {
    unroasted: string;
    roasted: string;
    gross: string;
    fee: string;
    net: string;
  };
  uncheckpointedRound?: string;
}

function toRewardsVM(body: RewardsResponse): RewardsVM {
  const eth = fromWei(body.pendingETH);
  const unrefined = fromWei(body.pendingPEA.unroasted);
  const refined = fromWei(body.pendingPEA.roasted);
  const net = fromWei(body.pendingPEA.net);
  return {
    pendingEthWei: body.pendingETH,
    pendingEth: eth,
    pendingEthFormatted: fmtToken(eth, 6),
    unrefinedPeaWei: body.pendingPEA.unroasted,
    unrefinedPea: unrefined,
    unrefinedPeaFormatted: fmtToken(unrefined, 2),
    refinedPeaWei: body.pendingPEA.roasted,
    refinedPea: refined,
    refinedPeaFormatted: fmtToken(refined, 2),
    netPeaWei: body.pendingPEA.net,
    netPea: net,
    netPeaFormatted: fmtToken(net, 2),
    feePeaFormatted: fmtToken(fromWei(body.pendingPEA.fee), 2),
    // uint64 0 = "no uncheckpointed round" on-chain — normalize to null
    // (the field may also be absent entirely).
    uncheckpointedRound:
      body.uncheckpointedRound !== undefined &&
      Number(body.uncheckpointedRound) > 0
        ? Number(body.uncheckpointedRound)
        : null,
  };
}

// Adapter defense (2026-07-18, live incident): the backend's rewards
// ledger only counts CHECKPOINTED wins, but the contract's own
// getTotalPendingRewards view includes the uncheckpointed round — a wallet
// mining all day showed 0/0 in the panel while the chain held 33 PEA.
// Overlay the chain's numbers over the payload before translating; the
// chain is what claims settle against, so it is the display truth too.
// Remove when the backend sources these fields from the contract view.
async function overlayChainRewards(
  address: Address,
  body: RewardsResponse,
): Promise<RewardsResponse> {
  try {
    // 5s cap: a slow RPC must degrade to backend numbers, never a stuck panel.
    const client = createPublicClient({
      chain: CHAIN,
      transport: http(RPC_URL, { timeout: 5_000 }),
    });
    const pending = await client.readContract({
      address: CONTRACTS.gridMining,
      abi: gridMiningAbi,
      functionName: "getTotalPendingRewards",
      args: [address],
    });
    // Positional tuple: [pendingEth, unharvested, harvested, round].
    const unharvested = pending[1] as bigint;
    const harvested = pending[2] as bigint;
    const round = pending[3] as bigint;
    const gross = unharvested + harvested;
    const fee = gross / 10n; // flat 10% harvest fee, per the stated economics
    return {
      ...body,
      pendingETH: (pending[0] as bigint).toString(),
      pendingPEA: {
        unroasted: unharvested.toString(),
        roasted: harvested.toString(),
        gross: gross.toString(),
        fee: fee.toString(),
        net: (gross - fee).toString(),
      },
      uncheckpointedRound: round > 0n ? round.toString() : undefined,
    };
  } catch {
    return body; // RPC hiccup: the backend payload is better than nothing
  }
}

// ─── Optimistic rewards updates (SSE payloads applied directly) ─────────────
// The strict /rewards endpoint sits behind a shared rate pool + throttle, so
// waiting for a refetch made post-claim values lag 20–80s. The SSE payloads
// already carry the truth: apply them instantly; the (throttled) refetch
// only trues up afterwards.

/** BigInt-parse a wei string; tolerates hex and garbage (→ 0n). */
function toBig(value: string | null | undefined): bigint {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

/** Rebuild the derived PEA fields (gross → 10% refining fee → net). */
function withPeaWei(
  vm: RewardsVM,
  unrefinedWei: bigint,
  refinedWei: bigint,
): RewardsVM {
  const gross = unrefinedWei + refinedWei;
  const fee = gross / 10n;
  const net = gross - fee;
  const unrefined = fromWei(unrefinedWei.toString());
  const refined = fromWei(refinedWei.toString());
  const netN = fromWei(net.toString());
  return {
    ...vm,
    unrefinedPeaWei: unrefinedWei.toString(),
    unrefinedPea: unrefined,
    unrefinedPeaFormatted: fmtToken(unrefined, 2),
    refinedPeaWei: refinedWei.toString(),
    refinedPea: refined,
    refinedPeaFormatted: fmtToken(refined, 2),
    netPeaWei: net.toString(),
    netPea: netN,
    netPeaFormatted: fmtToken(netN, 2),
    feePeaFormatted: fmtToken(fromWei(fee.toString()), 2),
  };
}

/** claimedETH pays out ALL pending ETH. */
export function zeroClaimedEth(vm: RewardsVM): RewardsVM {
  return {
    ...vm,
    pendingEthWei: "0",
    pendingEth: 0,
    pendingEthFormatted: fmtToken(0, 6),
  };
}

/** claimedPEA pays out the whole PEA position (net of the refining fee). */
export function zeroClaimedPea(vm: RewardsVM): RewardsVM {
  return withPeaWei(vm, 0n, 0n);
}

/** checkpointed moves a round's on-chain rewards into the pending totals. */
export function applyCheckpointed(
  vm: RewardsVM,
  ethRewardWei: string,
  peaRewardWei: string,
): RewardsVM {
  const eth = toBig(vm.pendingEthWei) + toBig(ethRewardWei);
  const ethN = fromWei(eth.toString());
  return {
    ...withPeaWei(
      vm,
      toBig(vm.unrefinedPeaWei) + toBig(peaRewardWei),
      toBig(vm.refinedPeaWei),
    ),
    pendingEthWei: eth.toString(),
    pendingEth: ethN,
    pendingEthFormatted: fmtToken(ethN, 6),
    uncheckpointedRound: null, // just got checkpointed
  };
}

interface StakingResponse {
  balance: string;
  pendingRewards: string;
  canCompound: boolean;
}

function toStakingVM(body: StakingResponse): StakingPositionVM {
  const staked = fromWei(body.balance);
  const pendingYield = fromWei(body.pendingRewards);
  return {
    stakedWei: body.balance,
    staked,
    stakedFormatted: fmtToken(staked, 2),
    pendingYieldWei: body.pendingRewards,
    pendingYield,
    pendingYieldFormatted: fmtToken(pendingYield, 2),
    canCompound: body.canCompound,
  };
}

interface AutomineResponse {
  config: {
    strategyId: number;
    numBlocks: number;
    amountPerBlock: string;
    active: boolean;
    executorFeeBps: number;
    numRounds: number;
    roundsExecuted: number;
    selectedBlocks: number[];
    executorFlatFee: string;
  };
  costPerRound: string;
  roundsRemaining: number;
  totalRefundable: string;
}

function toAutomineVM(body: AutomineResponse): AutomineVM {
  return {
    active: body.config.active,
    strategyId: body.config.strategyId,
    numRounds: body.config.numRounds,
    roundsExecuted: body.config.roundsExecuted,
    roundsRemaining: Number(body.roundsRemaining),
    selectedBlocks: body.config.selectedBlocks,
    amountPerBlockWei: body.config.amountPerBlock,
    costPerRoundWei: body.costPerRound,
    costPerRoundFormatted: fmtToken(fromWei(body.costPerRound), 6),
    totalRefundableWei: body.totalRefundable,
    totalRefundableFormatted: fmtToken(fromWei(body.totalRefundable), 6),
    executorFeeBps: body.config.executorFeeBps,
    executorFlatFeeWei: body.config.executorFlatFee,
  };
}

// ─── Provider ────────────────────────────────────────────────────────────────

type Kind = "rewards" | "staking" | "automine";

const PATHS: Record<Kind, (addr: string) => string> = {
  rewards: (a) => `/api/user/${a}/rewards`,
  staking: (a) => `/api/staking/${a}`,
  automine: (a) => `/api/automine/${a}`,
};

interface UserDataApi {
  rewards: HookResult<RewardsVM>;
  staking: HookResult<StakingPositionVM>;
  automine: HookResult<AutomineVM>;
  /** Increments on stakeDeposited/stakeWithdrawn — key stats fetches on it. */
  stakingStatsTick: number;
  /** Post-tx nudge — throttled to the strict rate limit. */
  refresh(kind: Kind): void;
}

/** Everything runStrictFetch needs from the provider, injected per call. */
interface FetchCtx {
  addrRef: { current: Address | null };
  inflight: Set<Kind>;
  lastFetch: Map<string, number>;
  trailing: Map<Kind, ReturnType<typeof setTimeout>>;
  apply(kind: Kind, addrAt: Address, body: unknown): void;
  markError(kind: Kind, addrAt: Address): void;
}

/**
 * One throttled fetch of a strict endpoint (module-level — runs only from
 * effects/handlers/timers, never during render). If inside the throttle
 * window, schedules a single trailing refetch at the boundary — event-driven
 * updates stay eventually consistent without burning the 5/min budget.
 */
function runStrictFetch(kind: Kind, ctx: FetchCtx): void {
  const addrAt = ctx.addrRef.current;
  if (!addrAt || !API_URL) return;
  const key = `${kind}:${addrAt}`;
  const now = Date.now();
  const last = ctx.lastFetch.get(key) ?? 0;
  if (ctx.inflight.has(kind)) return;
  if (now - last < MIN_REFETCH_MS) {
    if (!ctx.trailing.has(kind)) {
      ctx.trailing.set(
        kind,
        setTimeout(
          () => {
            ctx.trailing.delete(kind);
            runStrictFetch(kind, ctx);
          },
          MIN_REFETCH_MS - (now - last),
        ),
      );
    }
    return;
  }
  ctx.inflight.add(kind);
  ctx.lastFetch.set(key, now);
  void fetch(`${API_URL}${PATHS[kind](addrAt)}`)
    .then(async (res) => {
      if (res.status === 429) {
        // Shared strict pool exhausted — retry once the window resets
        // instead of surfacing an error for a self-healing condition.
        if (!ctx.trailing.has(kind)) {
          ctx.trailing.set(
            kind,
            setTimeout(() => {
              ctx.trailing.delete(kind);
              ctx.lastFetch.delete(key); // bypass the throttle for the retry
              runStrictFetch(kind, ctx);
            }, 61_000),
          );
        }
        return;
      }
      if (!res.ok) throw new Error(`${kind} failed: ${res.status}`);
      ctx.apply(kind, addrAt, await res.json());
    })
    .catch(() => ctx.markError(kind, addrAt))
    .finally(() => {
      ctx.inflight.delete(kind);
    });
}

const LOADING: HookResult<never> = { data: undefined, status: "loading" };

const UserDataContext = createContext<UserDataApi | null>(null);

/** Store shape duck-typed — the mock engine has no setAddress. */
interface AddressAware {
  setAddress?: (address: Address | null) => void;
}

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const { address, status } = useWallet();
  const store = useEngineStore() as AddressAware;
  const toast = useToast();

  const [rewards, setRewards] = useState<HookResult<RewardsVM>>(LOADING);
  const [staking, setStaking] =
    useState<HookResult<StakingPositionVM>>(LOADING);
  const [automine, setAutomine] = useState<HookResult<AutomineVM>>(LOADING);
  // Bumped on stakeDeposited/stakeWithdrawn — StakePage keys its
  // /api/staking/stats fetch on it for fresh pool totals after each action.
  const [stakingStatsTick, setStakingStatsTick] = useState(0);

  const connected = IS_API_MODE && status === "connected" && !!address;
  const addr = connected ? (address!.toLowerCase() as Address) : null;
  // Mirrors `addr` for async callbacks (stale-apply guard); updated in an
  // effect declared FIRST so it commits before the fetch/SSE effects run.
  // Mirrors the automine slice for mount-scoped SSE handlers (the
  // autoMineExecuted toast reads the standing config's tile count).
  const automineRef = useRef(automine.data);
  useEffect(() => {
    automineRef.current = automine.data;
  }, [automine.data]);

  const addrRef = useRef(addr);
  useEffect(() => {
    addrRef.current = addr;
  }, [addr]);

  // Identity changed (connect/disconnect/switch): drop the previous
  // identity's data during render (adjust-state-during-render, same pattern
  // as ProfilePanel) so a paint never shows another wallet's numbers.
  const [lastAddr, setLastAddr] = useState(addr);
  if (lastAddr !== addr) {
    setLastAddr(addr);
    setRewards(LOADING);
    setStaking(LOADING);
    setAutomine(LOADING);
  }

  const inflight = useRef(new Set<Kind>());
  const lastFetch = useRef(new Map<string, number>());
  const trailing = useRef(new Map<Kind, ReturnType<typeof setTimeout>>());

  const applyResult = useCallback(
    (kind: Kind, addrAt: Address, body: unknown) => {
      if (addrRef.current !== addrAt) return; // identity changed mid-flight
      if (kind === "rewards") {
        void overlayChainRewards(addrAt, body as RewardsResponse).then((b) => {
          if (addrRef.current !== addrAt) return; // re-check after the RPC read
          setRewards({ data: toRewardsVM(b), status: "live" });
        });
        return;
      } else if (kind === "staking")
        setStaking({
          data: toStakingVM(body as StakingResponse),
          status: "live",
        });
      else
        setAutomine({
          data: toAutomineVM(body as AutomineResponse),
          status: "live",
        });
    },
    [],
  );

  const markError = useCallback((kind: Kind, addrAt: Address) => {
    if (addrRef.current !== addrAt) return;
    // Rewards have a second source of truth: when the backend is down
    // (e.g. a 502), synthesize the whole payload from the contract's own
    // pending view — the chain is up and is what claims settle against.
    if (kind === "rewards") {
      const zeros: RewardsResponse = {
        pendingETH: "0",
        pendingPEA: {
          unroasted: "0",
          roasted: "0",
          gross: "0",
          fee: "0",
          net: "0",
        },
      };
      void overlayChainRewards(addrAt, zeros).then((b) => {
        if (addrRef.current !== addrAt) return;
        if (b !== zeros) {
          // The chain read succeeded (overlay returns a new object).
          setRewards({ data: toRewardsVM(b), status: "live" });
        } else {
          setRewards((prev) =>
            prev.data ? prev : { data: undefined, status: "error" },
          );
        }
      });
      return;
    }
    // Keep stale data if we have it; only surface error pre-data.
    const mark = <T,>(prev: HookResult<T>): HookResult<T> =>
      prev.data ? prev : { data: undefined, status: "error" };
    if (kind === "staking") setStaking(mark);
    else setAutomine(mark);
  }, []);

  // Stable identity (all deps stable) — safe in the effect deps below.
  const fetchKind = useCallback(
    (kind: Kind) =>
      runStrictFetch(kind, {
        addrRef,
        inflight: inflight.current,
        lastFetch: lastFetch.current,
        trailing: trailing.current,
        apply: applyResult,
        markError,
      }),
    [applyResult, markError],
  );

  // Identity bridge into the game store (?user= bootstrap + own-deploy lock).
  useEffect(() => {
    store.setAddress?.(addr);
  }, [store, addr]);

  // Rewards are polled on a timer; staking and automine are NOT. Only
  // rewards change without an event we receive: a round settles roughly every
  // 60s and credits its winners, whereas a staking position or an AutoMiner
  // config only moves when this user acts, which arrives over SSE.
  //
  // This replaces a per-rollover refetch removed on 2026-07-17, which refetched
  // ALL THREE slices every round and 429-starved the shared 5/min pool. One
  // slice per minute, paused while the tab is hidden, leaves headroom for the
  // post-claim refreshes that starved before.

  // Per-user SSE + initial strict-trio fetch.
  useEffect(() => {
    if (!connected || !addr || !API_URL) return;
    let alive = true;

    fetchKind("rewards");
    fetchKind("staking");
    fetchKind("automine");

    const es = new EventSource(`${API_URL}/api/user/${addr}/events`);
    const on = <T,>(type: string, cb: (payload: T) => void) =>
      es.addEventListener(type, (e) => {
        if (!alive) return;
        try {
          cb(JSON.parse((e as MessageEvent).data) as T);
        } catch {
          // Malformed event — the next refresh resyncs.
        }
      });

    // RECONNECT-only resync. This used to fire on the first open too and lean
    // on the 4s dedupe to swallow it, which holds only when the stream opens
    // within 4s of mount. A slower open turned a 3-request page load into 6
    // against a 5/min budget, so the 6th was already over.
    let everOpened = false;
    es.addEventListener("open", () => {
      if (!alive) return;
      if (!everOpened) {
        everOpened = true;
        return;
      }
      fetchKind("rewards");
      fetchKind("staking");
      fetchKind("automine");
    });

    on<{ roundId: string; ethReward: string; peaReward: string }>(
      "checkpointed",
      (p) => {
        toast.push({
          title: "Rewards checkpointed",
          body: `Round ${p.roundId} rewards are now claimable.`,
          variant: "info",
        });
        // Direct-apply the payload (instant UI); the refetch trues up.
        setRewards((prev) =>
          prev.data
            ? {
                data: applyCheckpointed(prev.data, p.ethReward, p.peaReward),
                status: "live",
              }
            : prev,
        );
        fetchKind("rewards");
      },
    );
    on<{ amount: string; txHash: string }>("claimedETH", (p) => {
      toast.push({
        title: "ETH claimed",
        body: `${fmtToken(fromWei(p.amount), 6)} ETH`,
        variant: "success",
        txHash: p.txHash,
      });
      setRewards((prev) =>
        prev.data ? { data: zeroClaimedEth(prev.data), status: "live" } : prev,
      );
      fetchKind("rewards");
    });
    on<{ net: string; txHash: string }>("claimedPEA", (p) => {
      setRewards((prev) =>
        prev.data ? { data: zeroClaimedPea(prev.data), status: "live" } : prev,
      );
      toast.push({
        title: "PEA claimed",
        body: `${fmtToken(fromWei(p.net), 2)} PEA (net of harvest fee)`,
        variant: "success",
        txHash: p.txHash,
      });
      fetchKind("rewards");
    });
    on<{ roundId: string; roundsExecuted: number }>("autoMineExecuted", (p) => {
      // Tile count from the standing config (the event payload carries
      // none); fall back to the plain sentence pre-hydration.
      const tiles = automineRef.current?.selectedBlocks.length;
      toast.push({
        title: "AutoMiner deployed",
        body: tiles
          ? `Round ${p.roundId} deployed across ${tiles} ${tiles === 1 ? "tile" : "tiles"} for you.`
          : `Round ${p.roundId} deployed for you.`,
        variant: "info",
      });
      // Cheap local decrement; the throttled refetch trues it up.
      setAutomine((prev) =>
        prev.data
          ? {
              data: {
                ...prev.data,
                roundsExecuted: p.roundsExecuted,
                roundsRemaining: Math.max(
                  0,
                  prev.data.numRounds - p.roundsExecuted,
                ),
              },
              status: "live",
            }
          : prev,
      );
      fetchKind("automine");
    });
    on<{ roundsCompleted: number }>("configDeactivated", (p) => {
      toast.push({
        title: "AutoMiner finished",
        body: `Completed ${p.roundsCompleted} prepaid rounds.`,
        variant: "info",
      });
      fetchKind("automine");
    });
    on<{ refundAmount: string; roundsCompleted: number }>("stopped", (p) => {
      toast.push({
        title: "AutoMiner stopped",
        body: `Refunded ${fmtToken(fromWei(p.refundAmount), 6)} ETH after ${p.roundsCompleted} rounds.`,
        variant: "success",
      });
      fetchKind("automine");
    });
    const onStake =
      (title: string) => (p: { newBalance: string; txHash?: string }) => {
        toast.push({ title, variant: "success", txHash: p.txHash });
        // The payload carries the authoritative new balance — no strict fetch.
        setStaking((prev) =>
          prev.data
            ? {
                data: {
                  ...prev.data,
                  stakedWei: p.newBalance,
                  staked: fromWei(p.newBalance),
                  stakedFormatted: fmtToken(fromWei(p.newBalance), 2),
                },
                status: "live",
              }
            : prev,
        );
        fetchKind("staking");
        // Nudge StakePage to refetch /api/staking/stats — the backend now
        // refreshes its cache on stake webhooks (backend 2026-07-17), so the
        // pool totals are fresh immediately after each action. (Deliberately
        // /api/staking/stats, NOT the analytics staking tab — that one has
        // its own 60s response cache stacked on top.)
        setStakingStatsTick((t) => t + 1);
      };
    on("stakeDeposited", onStake("Stake deposited"));
    on("stakeWithdrawn", onStake("Stake withdrawn"));
    on<{ amount: string }>("yieldClaimed", (p) => {
      toast.push({
        title: "Yield claimed",
        body: `${fmtToken(fromWei(p.amount), 2)} PEA`,
        variant: "success",
      });
      fetchKind("staking");
    });
    on<{ amount: string }>("yieldCompounded", (p) => {
      toast.push({
        title: "Yield compounded",
        body: `${fmtToken(fromWei(p.amount), 2)} PEA restaked.`,
        variant: "info",
      });
      fetchKind("staking");
    });

    const trailingTimers = trailing.current;
    // Poll rewards only, and only while the tab is visible: a background tab
    // spending the shared budget starves the foreground one.
    const pollRewards = () => {
      if (document.visibilityState === "visible") fetchKind("rewards");
    };
    const rewardsTimer = setInterval(pollRewards, REWARDS_POLL_MS);
    // Coming back to the tab is exactly when a stale figure gets looked at.
    document.addEventListener("visibilitychange", pollRewards);

    return () => {
      alive = false;
      clearInterval(rewardsTimer);
      document.removeEventListener("visibilitychange", pollRewards);
      es.close();
      for (const t of trailingTimers.values()) clearTimeout(t);
      trailingTimers.clear();
    };
  }, [connected, addr, toast, fetchKind]);

  const api = useMemo<UserDataApi>(
    () => ({
      rewards,
      staking,
      automine,
      stakingStatsTick,
      refresh: (kind) => fetchKind(kind),
    }),
    [rewards, staking, automine, stakingStatsTick, fetchKind],
  );

  return (
    <UserDataContext.Provider value={api}>{children}</UserDataContext.Provider>
  );
}

// ─── Hooks (safe without the provider — tests mount panels bare) ────────────

export function useRewards(): HookResult<RewardsVM> {
  return useContext(UserDataContext)?.rewards ?? LOADING;
}

export function useStakingPosition(): HookResult<StakingPositionVM> {
  return useContext(UserDataContext)?.staking ?? LOADING;
}

export function useAutomine(): HookResult<AutomineVM> {
  return useContext(UserDataContext)?.automine ?? LOADING;
}

export function useUserDataRefresh(): ((kind: Kind) => void) | undefined {
  return useContext(UserDataContext)?.refresh;
}

/** Bumps on the user's stake/unstake confirmations — key /api/staking/stats
 * fetches on it (the backend refreshes that cache on stake webhooks). */
export function useStakingStatsTick(): number {
  return useContext(UserDataContext)?.stakingStatsTick ?? 0;
}
