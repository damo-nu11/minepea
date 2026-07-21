"use client";

/**
 * Market data for the Explore hero, read from our own cached /api/price-chart
 * rather than GeckoTerminal directly (see that route for why).
 *
 * Follows the repo's hook contract: { data, status } with data undefined until
 * it arrives, so callers design their empty state instead of inheriting one.
 * Fetching happens in an effect, never during render, so SSR and the first
 * client render agree (Convention 7).
 *
 * Several components on one page want this (the chart and the stats rail), so
 * the request is shared: without that, each consumer opens its own connection
 * for a payload that is identical by construction.
 */

import { useEffect, useState } from "react";
import { LOCKED_SUPPLY_PEA } from "@/lib/prices/geckoTerminal";
import type {
  PricePointWire,
  TokenMarketWire,
} from "@/lib/prices/geckoTerminal";

export interface MarketData {
  points: PricePointWire[];
  priceUsd: number | null;
  market: TokenMarketWire | null;
  poolAddress: string | null;
}

export interface MarketResult {
  data: MarketData | undefined;
  status: "loading" | "live" | "error";
}

/**
 * The supply figures the hero rail quotes, all derived from onchain data.
 *
 * The split is the standard one and it matters:
 *   FDV        = price x TOTAL supply (everything issued)
 *   Market cap = price x CIRCULATING  (issued minus locked)
 *
 * FDV is deliberately NOT price x the 3,000,000 hard cap. That supply has not
 * been mined and pricing it today would overstate the token by orders of
 * magnitude (user 2026-07-21). While LOCKED_SUPPLY_PEA is 0 the two numbers
 * are equal, which is correct: nothing is locked, so everything issued
 * circulates. They separate by themselves the moment the lock is recorded.
 */
export interface SupplyView {
  totalSupply: number | null;
  circulating: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
}

export function supplyView(
  market: TokenMarketWire | null | undefined,
  priceUsd: number | null | undefined,
): SupplyView {
  const totalSupply = market?.totalSupply ?? null;
  const circulating =
    totalSupply === null ? null : Math.max(0, totalSupply - LOCKED_SUPPLY_PEA);
  const price = priceUsd ?? null;
  return {
    totalSupply,
    circulating,
    marketCapUsd:
      price !== null && circulating !== null ? price * circulating : null,
    // Prefer GeckoTerminal's own FDV so the number cross-checks against what
    // an explorer shows; fall back to the same arithmetic when it is absent.
    fdvUsd:
      market?.fdvUsd ??
      (price !== null && totalSupply !== null ? price * totalSupply : null),
  };
}

/** One in-flight request shared by every consumer mounted in the same tick. */
let inFlight: Promise<MarketData | null> | null = null;

async function load(): Promise<MarketData | null> {
  try {
    const res = await fetch("/api/price-chart");
    if (!res.ok) throw new Error(`price-chart ${res.status}`);
    const body = (await res.json()) as {
      points?: PricePointWire[];
      priceUsd?: number | null;
      market?: TokenMarketWire | null;
      poolAddress?: string | null;
      error?: string;
    };
    // Upstream failure and a genuinely empty response are the same thing to a
    // caller: nothing to show, fall back.
    if (body.error && !body.priceUsd && !(body.points ?? []).length)
      return null;
    return {
      points: body.points ?? [],
      priceUsd: body.priceUsd ?? null,
      market: body.market ?? null,
      poolAddress: body.poolAddress ?? null,
    };
  } catch {
    return null;
  }
}

export function useMarketData(): MarketResult {
  const [state, setState] = useState<MarketResult>({
    data: undefined,
    status: "loading",
  });

  useEffect(() => {
    let live = true;
    inFlight ??= load().finally(() => {
      // Let the next mount start a fresh request rather than replaying a
      // response that may be minutes old by then.
      inFlight = null;
    });
    void inFlight.then((data) => {
      if (!live) return;
      setState(
        data ? { data, status: "live" } : { data: undefined, status: "error" },
      );
    });
    return () => {
      live = false;
    };
  }, []);

  return state;
}

/** Price history only, for the chart. */
export function usePriceChart(): {
  data: PricePointWire[] | undefined;
  status: "loading" | "live" | "error";
  poolAddress: string | null;
} {
  const { data, status } = useMarketData();
  const points = data?.points;
  return {
    data: points && points.length > 0 ? points : undefined,
    status:
      points && points.length > 0
        ? status
        : status === "loading"
          ? "loading"
          : "error",
    poolAddress: data?.poolAddress ?? null,
  };
}
