"use client";

/**
 * The connected wallet's settled round history + lifetime totals for
 * /profile (plan reference/profile-plan.md P2).
 *
 * MOCK mode reads the engine's userRounds slice through useUserRounds.
 * LIVE mode fetches the backend's own history endpoint and translates it —
 * one call carries both the rows and the server-maintained aggregates, so
 * nothing order-dependent (streaks, best round, win rate) is ever computed
 * client-side over a partial page.
 *
 * Audit-hardened 2026-07-30, all four found by review before launch:
 * - NO per-consumer AbortController. The in-flight promise is SHARED across
 *   mounts, so one consumer aborting it rejects everyone else's — and the
 *   old guard tested the aborting consumer's own signal, so the survivor
 *   reported the error and painted an error state. Reproduced exactly under
 *   StrictMode's mount/cleanup/mount. Cancellation is now the local
 *   `cancelled` flag only (the usePeapotRounds pattern this mirrors).
 * - A REQUEST TIMEOUT, feature-detected. Without one a hung origin left the
 *   promise pending forever AND pinned it in `inflight` (the delete lives in
 *   .finally), so every later mount in that tab reused the dead promise.
 * - FAILURES ARE CACHED briefly. On rejection nothing was written, so every
 *   remount refetched immediately with no floor — a rate-limited endpoint
 *   got hammered by a user clicking back and forth.
 * - REFRESHES WHEN THE ROUND ADVANCES. Deps were [addr] alone, so a wallet
 *   that won while the page was open saw nothing until it navigated away and
 *   back. The TTL was only ever a remount-thrash guard, never freshness.
 *
 * Still true by design: sits in the backend's DEFAULT rate tier (60/min),
 * never polls, and `totals: null` means "never mined" — a designed empty
 * state, not an error.
 */

import { useEffect, useState } from "react";
import {
  type UserHistoryResponse,
  peaPriceEth,
  toUserRoundWire,
  toUserTotalsWire,
} from "@/lib/api/translate";
import { useRound, useUserRounds } from "@/lib/hooks/useGame";
import {
  bestRoundFromRows,
  toUserRoundVM,
  toUserTotalsVM,
} from "@/lib/mappers";
import { report } from "@/lib/report";
import type { Address, HookResult, UserHistoryVM } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
/** The backend caps limit at 500 and caches responses for 20s. */
const PAGE_LIMIT = 500;
const CACHE_TTL_MS = 30_000;
/** Floor under a failing endpoint: a remount storm must not become a
 * request storm against something already rate-limiting us. */
const FAILURE_TTL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 15_000;

type Entry = { vm: UserHistoryVM; at: number };
const cache = new Map<string, Entry>();
const failures = new Map<string, number>();
const inflight = new Map<string, Promise<UserHistoryVM>>();

/** AbortSignal.timeout is absent on older engines; a bare call there throws
 * and kills the fetch outright (the lesson from useStockpot). */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
    ? AbortSignal.timeout(ms)
    : undefined;
}

/** Exported for tests: the live-mode fetch + translate, without React. */
export async function fetchUserHistory(
  address: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<UserHistoryVM> {
  const url = `${API_URL}/api/user/${address.toLowerCase()}/history?type=deploy&settled=true&limit=${PAGE_LIMIT}`;
  const res = await fetchImpl(url, {
    signal: signal ?? timeoutSignal(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`history ${res.status}`);
  const body = (await res.json()) as UserHistoryResponse;
  // PEA is most of what a win pays, so every return figure needs it priced.
  // The backend quotes it alongside the aggregates it uses it for.
  const price = peaPriceEth(body.totals?.peaPriceEth);
  // Unsettled rows translate to null and drop out: the profile shows
  // settled rounds only (the live round is deliberately absent).
  const rounds = (body.history ?? [])
    .map(toUserRoundWire)
    .filter((r) => r !== null)
    .map((w) => toUserRoundVM(w, price))
    // The caption promises newest first; enforce it rather than trusting
    // the backend's page order to stay what it is today.
    .sort((a, b) => b.roundId - a.roundId);
  const totals = body.totals
    ? toUserTotalsVM(toUserTotalsWire(body.totals))
    : null;
  // The backend's bestRound is ETH-only, which reports a round carried by
  // its PEA emission as a loss. Re-fold it from the rows — but ONLY when
  // this response holds the wallet's whole history, since a max over one
  // page of many is just the best round we happened to fetch.
  const complete = (body.pagination?.pages ?? 1) <= 1;
  return {
    rounds,
    totals:
      totals && complete
        ? { ...totals, bestRound: bestRoundFromRows(rounds) }
        : totals,
  };
}

export function useUserHistory(
  address: Address | null,
): HookResult<UserHistoryVM> {
  const mock = useUserRounds();
  const round = useRound();
  const addr = address?.toLowerCase() ?? null;
  // A settled round is the signal that this wallet's history may have
  // changed. Cheap: the TTL below caps it at ~2 requests/minute.
  const roundId = round.data?.roundId ?? 0;

  // State carries the address it belongs to, so a wallet switch resets it
  // DURING RENDER (the house pattern) rather than painting one frame of
  // the previous wallet's history. Warm cache hydrates in the same step.
  const [state, setState] = useState<{
    addr: string | null;
    res: HookResult<UserHistoryVM>;
  }>({ addr: null, res: { data: undefined, status: "loading" } });
  if (state.addr !== addr) {
    const warm = addr ? cache.get(addr) : undefined;
    setState({
      addr,
      res: warm
        ? { data: warm.vm, status: "live" }
        : { data: undefined, status: "loading" },
    });
  }

  useEffect(() => {
    if (!API_URL || !addr) return;
    const cached = cache.get(addr);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return;
    const failedAt = failures.get(addr);
    if (failedAt && Date.now() - failedAt < FAILURE_TTL_MS) return;

    let cancelled = false;
    const key = addr;
    // NOTE: no AbortController here on purpose — see the header. The
    // promise is shared, so no single consumer may cancel it.
    const run =
      inflight.get(key) ??
      fetchUserHistory(key).finally(() => inflight.delete(key));
    inflight.set(key, run);
    void run
      .then((vm) => {
        cache.set(key, { vm, at: Date.now() });
        failures.delete(key);
        if (!cancelled) setState({ addr, res: { data: vm, status: "live" } });
      })
      .catch((e) => {
        failures.set(key, Date.now());
        if (cancelled) return;
        report("user-history", e);
        // A failed refresh keeps whatever is already on screen.
        setState((cur) =>
          cur.res.data
            ? cur
            : { addr, res: { data: undefined, status: "error" } },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [addr, roundId]);

  if (!API_URL) return mock;
  if (!addr) return { data: undefined, status: "loading" };
  return state.res;
}
