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
 * Rules this obeys, all learned the hard way elsewhere in this app:
 * - NOT in the backend's strict per-IP pool (default tier, 60/min), so a
 *   profile visit can never starve the rewards/staking/automine reads. It
 *   still fetches once per wallet rather than polling.
 * - Keyed and cached per ADDRESS, aborted on identity change: a wallet
 *   switch must never paint the previous wallet's history.
 * - A failed refresh keeps whatever is already shown.
 * - `totals: null` means "never mined", which is a designed empty state,
 *   not an error and not a row of zeros.
 */

import { useEffect, useState } from "react";
import {
  type UserHistoryResponse,
  toUserRoundWire,
  toUserTotalsWire,
} from "@/lib/api/translate";
import { useUserRounds } from "@/lib/hooks/useGame";
import { toUserRoundVM, toUserTotalsVM } from "@/lib/mappers";
import { report } from "@/lib/report";
import type { Address, HookResult, UserHistoryVM } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
/** The backend caps limit at 500 and caches responses for 20s. One page of
 * 500 covers every wallet we can realistically have today; beyond that the
 * UI says "last 500 rounds" rather than claiming lifetime. */
const PAGE_LIMIT = 500;
const CACHE_TTL_MS = 30_000;

type Entry = { vm: UserHistoryVM; at: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<UserHistoryVM>>();

/** Exported for tests: the live-mode fetch + translate, without React. */
export async function fetchUserHistory(
  address: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<UserHistoryVM> {
  const url = `${API_URL}/api/user/${address.toLowerCase()}/history?type=deploy&settled=true&limit=${PAGE_LIMIT}`;
  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`history ${res.status}`);
  const body = (await res.json()) as UserHistoryResponse;
  // Unsettled rows translate to null and drop out: the profile shows
  // settled rounds only (the live round is deliberately absent from this
  // page entirely).
  const rounds = (body.history ?? [])
    .map(toUserRoundWire)
    .filter((r) => r !== null)
    .map(toUserRoundVM);
  return {
    rounds,
    totals: body.totals ? toUserTotalsVM(toUserTotalsWire(body.totals)) : null,
  };
}

export function useUserHistory(
  address: Address | null,
): HookResult<UserHistoryVM> {
  const mock = useUserRounds();
  const addr = address?.toLowerCase() ?? null;
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

    const ctrl = new AbortController();
    let cancelled = false;
    const key = addr;
    const run =
      inflight.get(key) ??
      fetchUserHistory(key, fetch, ctrl.signal).finally(() =>
        inflight.delete(key),
      );
    inflight.set(key, run);
    void run
      .then((vm) => {
        cache.set(key, { vm, at: Date.now() });
        // Guard the apply against an identity change mid-flight.
        if (!cancelled) setState({ addr, res: { data: vm, status: "live" } });
      })
      .catch((e) => {
        if (cancelled || ctrl.signal.aborted) return;
        report(e, "useUserHistory");
        // A failed refresh keeps whatever is already on screen.
        setState((cur) =>
          cur.res.data ? cur : { addr, res: { data: undefined, status: "error" } },
        );
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [addr]);

  if (!API_URL) return mock;
  if (!addr) return { data: undefined, status: "loading" };
  return state.res;
}
