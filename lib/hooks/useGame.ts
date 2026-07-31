"use client";

/**
 * Game data hooks (the project docs Data Layer). Every read hook returns
 * { data, status } and components must handle `undefined` data.
 *
 * Implementation notes:
 * - useSyncExternalStore reads the WHOLE snapshot (its identity changes on
 *   any engine mutation), but each hook memoizes its VM on the identity of
 *   its own slice — sub-objects keep referential identity unless their
 *   domain changed, so unrelated mutations don't re-map.
 * - Ticking values (countdown, relative times) do NOT live here — see
 *   useRoundTimer, and render relTime in leaf cells (Convention 4).
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useEngineStore } from "@/lib/engineContext";
import { liveEthPrice, livePeaPrice } from "@/lib/livePrices";
import {
  bestRoundFromRows,
  deriveUserTotals,
  toFeedItemVM,
  toPricesVM,
  toProtocolStatsVM,
  toRoundSummaryVM,
  toRoundVM,
  toUserRoundVM,
  toUserTotalsVM,
} from "@/lib/mappers";
import type { EngineSnapshot, UserGameState } from "@/lib/mock/engine";
import type {
  FeedItemVM,
  HookResult,
  PricesVM,
  ProtocolStatsVM,
  RoundPhase,
  RoundSummaryVM,
  RoundVM,
  UserHistoryVM,
} from "@/lib/types";

function hookStatus(snap: EngineSnapshot): "loading" | "live" | "error" {
  // A stream that has gone quiet is not live, however long it has been
  // bootstrapped. Consumers gate money decisions on this.
  if (snap.stale) return "error";
  if (snap.bootstrapped) return "live";
  return snap.error ? "error" : "loading";
}

function useSnapshot(): EngineSnapshot {
  const store = useEngineStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}

export function useRound(): HookResult<RoundVM> {
  const snap = useSnapshot();
  const data = useMemo(
    () => (snap.bootstrapped ? toRoundVM(snap.round) : undefined),
    [snap.bootstrapped, snap.round],
  );
  return { data, status: hookStatus(snap) };
}

/** Append-only bounded feed, newest first; stable monotonic ids as keys. */
export function useMinersFeed(): HookResult<FeedItemVM[]> {
  const snap = useSnapshot();
  const data = useMemo(
    () =>
      snap.bootstrapped ? snap.feed.map(toFeedItemVM).reverse() : undefined,
    [snap.bootstrapped, snap.feed],
  );
  return { data, status: hookStatus(snap) };
}

export function useRoundHistory(): HookResult<RoundSummaryVM[]> {
  const snap = useSnapshot();
  const data = useMemo(
    () => (snap.bootstrapped ? snap.history.map(toRoundSummaryVM) : undefined),
    [snap.bootstrapped, snap.history],
  );
  return { data, status: hookStatus(snap) };
}

/** The connected user's settled rounds + lifetime totals (profile page).
 * Mock: totals fold over the COMPLETE engine slice; live mode (P2) will
 * take both from the backend instead — never fold a paginated window. */
export function useUserRounds(): HookResult<UserHistoryVM> {
  const snap = useSnapshot();
  const { peaUsd, ethUsd } = snap.prices;
  const data = useMemo(() => {
    if (!snap.bootstrapped) return undefined;
    // Live mode reads the backend's own peaPriceEth; the sim has to derive
    // it from the two quotes. Both zero in the server snapshot, which is
    // "no price" — the PEA-inclusive figures dash rather than valuing the
    // emission at nothing.
    const price = ethUsd > 0 && peaUsd > 0 ? peaUsd / ethUsd : null;
    const totals = deriveUserTotals(snap.userRounds, price);
    // An explicit arrow, NOT a bare `.map(toUserRoundVM)`: map passes the
    // index as the second argument, which would price PEA at the row
    // number.
    const rounds = snap.userRounds.map((r) => toUserRoundVM(r, price));
    return {
      rounds,
      // Same re-fold live mode does, for the same reason and so the two
      // modes cannot disagree: the wire's bestRound is an ETH-only figure,
      // and the round a wallet remembers is the one that paid the most
      // overall. The mock slice is complete by construction.
      totals: totals
        ? { ...toUserTotalsVM(totals), bestRound: bestRoundFromRows(rounds) }
        : null,
    };
  }, [snap.bootstrapped, snap.userRounds, peaUsd, ethUsd]);
  return { data, status: hookStatus(snap) };
}

export function usePrices(): HookResult<PricesVM> {
  const snap = useSnapshot();
  // Real prices overlay the simulated feed when available: ETH from Coinbase
  // spot, PEA from the same GeckoTerminal pool the Explore chart is drawn
  // from, so a quoted price can never disagree with the chart beside it.
  // Either leg falls back to the simulation independently when its source is
  // unavailable, so the UI never blanks.
  const liveEth = useSyncExternalStore(
    liveEthPrice.subscribe,
    liveEthPrice.getSnapshot,
    liveEthPrice.getServerSnapshot,
  );
  const livePea = useSyncExternalStore(
    livePeaPrice.subscribe,
    livePeaPrice.getSnapshot,
    livePeaPrice.getServerSnapshot,
  );
  const data = useMemo(() => {
    if (!snap.bootstrapped) return undefined;
    const wire = {
      ...snap.prices,
      ...(liveEth !== null ? { ethUsd: liveEth } : {}),
      ...(livePea !== null ? { peaUsd: livePea } : {}),
    };
    return toPricesVM(wire);
  }, [snap.bootstrapped, snap.prices, liveEth, livePea]);
  return { data, status: hookStatus(snap) };
}

export function useProtocolStats(): HookResult<ProtocolStatsVM> {
  const snap = useSnapshot();
  const data = useMemo(
    () =>
      snap.bootstrapped ? toProtocolStatsVM(snap.protocolStats) : undefined,
    [snap.bootstrapped, snap.protocolStats],
  );
  return { data, status: hookStatus(snap) };
}

export function useUserGameState(): HookResult<UserGameState> {
  const snap = useSnapshot();
  return {
    data: snap.bootstrapped ? snap.user : undefined,
    status: hookStatus(snap),
  };
}

export interface RoundTimer {
  /** Whole seconds remaining, clamped at 0. */
  remainingSec: number;
  endsAt: number;
  roundId: number;
  phase: RoundPhase;
}

/**
 * Countdown derived from `endsAt` (Convention 3: absolute time is the single
 * authority; we never decrement a stored counter). Ticks at 500ms but only
 * re-renders when the whole second changes — use ONLY in leaf components
 * (Convention 4).
 */
export function useRoundTimer(): HookResult<RoundTimer> {
  const store = useEngineStore();
  const snap = useSnapshot();
  const { endsAt, roundId, phase } = snap.round;
  const [remainingSec, setRemainingSec] = useState(0);

  useEffect(() => {
    if (!snap.bootstrapped) return;
    const compute = () =>
      setRemainingSec(
        Math.max(
          0,
          Math.ceil((endsAt - (store.serverNow?.() ?? Date.now())) / 1000),
        ),
      );
    compute();
    const t = setInterval(compute, 500);
    return () => clearInterval(t);
  }, [snap.bootstrapped, endsAt]);

  if (!snap.bootstrapped) return { data: undefined, status: hookStatus(snap) };
  return { data: { remainingSec, endsAt, roundId, phase }, status: "live" };
}
