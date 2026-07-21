/**
 * Pins for the GeckoTerminal mapper. Both behaviours here fail silently rather
 * than loudly if broken: a reversed series still draws a chart (just backwards
 * in time), and picking the wrong pool still returns a price (just the wrong
 * one, from a pool with no liquidity).
 *
 * Upstream is faked at the fetch boundary, so these run offline and cannot be
 * rate limited.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPriceHistory, findDeepestPool } from "@/lib/prices/geckoTerminal";

function pool(address: string, reserve: string, price: string) {
  return {
    attributes: {
      address,
      reserve_in_usd: reserve,
      base_token_price_usd: price,
    },
  };
}

const TOKEN_BODY = {
  data: {
    attributes: {
      symbol: "PEA",
      normalized_total_supply: "10000.0",
      fdv_usd: "57.9",
      market_cap_usd: null,
      volume_usd: { h24: "4.14" },
      total_reserve_in_usd: "0.0198",
    },
  },
};

/** Route each upstream path to a canned body. Three endpoints are in play:
 * the pool list, the token, and OHLCV. */
function stubFetch(routes: {
  pools?: unknown;
  ohlcv?: unknown;
  token?: unknown;
}) {
  const fn = vi.fn(async (url: string) => {
    const body = url.includes("/ohlcv/")
      ? routes.ohlcv
      : url.endsWith("/pools")
        ? routes.pools
        : (routes.token ?? TOKEN_BODY);
    if (body === undefined) {
      return { ok: false, status: 429, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("findDeepestPool", () => {
  it("picks the pool with the largest USD reserve, not the first listed", async () => {
    stubFetch({
      pools: {
        data: [
          pool("0xshallow", "12.5", "1.00"),
          pool("0xdeep", "980000", "1.05"),
          pool("0xmid", "4200", "1.02"),
        ],
      },
    });
    const best = await findDeepestPool("0xtoken");
    expect(best?.address).toBe("0xdeep");
    expect(best?.priceUsd).toBe(1.05);
  });

  it("returns null when the token has no pools", async () => {
    stubFetch({ pools: { data: [] } });
    expect(await findDeepestPool("0xtoken")).toBeNull();
  });

  it("survives a pool quoting no price", async () => {
    stubFetch({
      pools: {
        data: [{ attributes: { address: "0xa", reserve_in_usd: "5" } }],
      },
    });
    const best = await findDeepestPool("0xtoken");
    expect(best?.address).toBe("0xa");
    expect(best?.priceUsd).toBeNull();
  });
});

describe("fetchPriceHistory", () => {
  // GeckoTerminal returns candles NEWEST FIRST; charts read left to right.
  const NEWEST_FIRST = {
    data: {
      attributes: {
        ohlcv_list: [
          [1_700_007_200, 3, 3, 3, 3.3, 1],
          [1_700_003_600, 2, 2, 2, 2.2, 1],
          [1_700_000_000, 1, 1, 1, 1.1, 1],
        ],
      },
    },
  };

  it("returns closes in ascending time order with epoch ms", async () => {
    stubFetch({
      pools: { data: [pool("0xp", "100", "3.30")] },
      ohlcv: NEWEST_FIRST,
    });
    const r = await fetchPriceHistory("0xtoken");
    expect(r.points.map((p) => p.v)).toEqual([1.1, 2.2, 3.3]);
    expect(r.points.map((p) => p.t)).toEqual([
      1_700_000_000_000, 1_700_003_600_000, 1_700_007_200_000,
    ]);
    expect(r.poolAddress).toBe("0xp");
  });

  it("carries token market facts through", async () => {
    stubFetch({
      pools: { data: [pool("0xp", "100", "3.30")] },
      ohlcv: NEWEST_FIRST,
    });
    const r = await fetchPriceHistory("0xtoken");
    expect(r.market).toEqual({
      symbol: "PEA",
      totalSupply: 10000,
      fdvUsd: 57.9,
      marketCapUsd: null,
      volume24hUsd: 4.14,
      // Pool reserve, NOT the token endpoint's total_reserve_in_usd (0.0198
      // in TOKEN_BODY). Aggregators publish the pool figure; quoting the
      // other one put the site ~4x below every explorer for the same pair.
      liquidityUsd: 100,
    });
  });

  it("reports liquidity from the pool, not the token total reserve", async () => {
    stubFetch({
      pools: {
        data: [pool("0xshallow", "5", "1.0"), pool("0xdeep", "4321", "1.0")],
      },
      ohlcv: NEWEST_FIRST,
    });
    const r = await fetchPriceHistory("0xtoken");
    expect(r.poolAddress).toBe("0xdeep");
    expect(r.market?.liquidityUsd).toBe(4321);
  });

  it("falls back to the token total reserve when the pool reports none", async () => {
    stubFetch({
      pools: {
        data: [{ attributes: { address: "0xp", base_token_price_usd: "1" } }],
      },
      ohlcv: NEWEST_FIRST,
    });
    const r = await fetchPriceHistory("0xtoken");
    expect(r.market?.liquidityUsd).toBe(0.0198);
  });

  it("prefers the pool's spot price for the rail, so it cannot drift from the chart", async () => {
    stubFetch({
      pools: { data: [pool("0xp", "100", "3.31")] },
      ohlcv: NEWEST_FIRST,
    });
    const r = await fetchPriceHistory("0xtoken");
    expect(r.priceUsd).toBe(3.31);
  });

  it("falls back to the newest close when the pool quotes no spot price", async () => {
    stubFetch({
      pools: {
        data: [{ attributes: { address: "0xp", reserve_in_usd: "100" } }],
      },
      ohlcv: NEWEST_FIRST,
    });
    const r = await fetchPriceHistory("0xtoken");
    expect(r.priceUsd).toBe(3.3);
  });

  it("drops malformed candles rather than charting NaN", async () => {
    stubFetch({
      pools: { data: [pool("0xp", "100", "2.00")] },
      ohlcv: {
        data: {
          attributes: {
            ohlcv_list: [
              [1_700_000_000, 1, 1, 1, 1.1, 1],
              [1_700_003_600, 2, 2, 2, null, 1],
              [1_700_007_200],
            ],
          },
        },
      },
    });
    const r = await fetchPriceHistory("0xtoken");
    expect(r.points).toEqual([{ t: 1_700_000_000_000, v: 1.1 }]);
  });

  it("reports an error instead of throwing when upstream rate limits", async () => {
    stubFetch({}); // every call 429s
    const r = await fetchPriceHistory("0xtoken");
    expect(r.points).toEqual([]);
    expect(r.priceUsd).toBeNull();
    expect(r.error).toMatch(/rate limit/i);
  });
});
