/**
 * GeckoTerminal price history for the Explore hero chart.
 *
 * WHY THE API AND NOT THE EMBED: GeckoTerminal ships an iframe widget, but it
 * carries "powered by" attribution, which is rejected for this site. The
 * project's recorded plan is the OHLCV endpoint feeding our own SVG chart kit,
 * so the data is real and the chrome stays ours.
 *
 * Convention 2: this module owns the WIRE type (raw numbers, the shape a real
 * backend would send) and the mapper into it. Components never see GeckoTerminal
 * JSON.
 *
 * SERVER ONLY. It is called from app/api/price-chart/route.ts so the response
 * is cached once for everyone: GeckoTerminal's free tier is ~30 requests per
 * minute per IP, which a per-browser fetch would burn through immediately.
 */

/** GeckoTerminal's slug for Robinhood Chain (verified against /api/v2/networks). */
export const GT_NETWORK = "robinhood";

/**
 * The token whose chart the Explore hero renders.
 *
 * >>> SWAP THIS ONE LINE WHEN THE REAL PEA TOKEN IS DEPLOYED. <<<
 *
 * This is currently a TEST token supplied by the user (2026-07-21) so the
 * chart can be exercised before launch. It is NOT PEA.
 *
 * NOTE that this address now drives the displayed PEA PRICE as well as the
 * chart: `usePrices` overlays the spot price from here, which is what makes
 * the hero rail, the header ticker and the chart agree instead of showing
 * three different numbers. The consequence is that while a test address sits
 * here, the whole site quotes that token's price as PEA's. Swapping the line
 * below fixes every surface at once.
 *
 * `NEXT_PUBLIC_PEA_CHART_TOKEN` overrides it without a code change.
 */
export const CHART_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_PEA_CHART_TOKEN ??
  "0xe158E2E7b750fA971b12Fb2bF2A7262f94010aC8";

/**
 * PEA held back from circulation: the team and treasury allocation.
 *
 * >>> SET THIS WHEN THE LOCK LANDS. <<<
 *
 * Circulating supply is derived as onchain total supply minus this, so the
 * figure the site quotes follows the lock instead of being asserted
 * separately. It is 0 today because nothing is locked yet, which is why
 * circulating and total currently read the same and market cap equals FDV.
 * Once the ~75% team and treasury lock is done, put the locked amount here and
 * market cap separates from FDV on its own.
 *
 * Deliberately NOT the 3,000,000 hard cap: most of that supply has not been
 * mined yet, so pricing it today would overstate the token's value by orders
 * of magnitude (user 2026-07-21).
 */
export const LOCKED_SUPPLY_PEA = 0;

/** One point of price history. Epoch ms + USD, the shape LineChart consumes. */
export interface PricePointWire {
  t: number;
  v: number;
}

/**
 * Market facts a DEX aggregator can actually know about a token.
 *
 * Note what is NOT here: circulating supply, and anything about mining. A DEX
 * sees swaps and reserves, not the protocol's own accounting, so PEA's
 * circulating supply and deployed-ETH volumes must keep coming from the
 * protocol. Sourcing them here would quietly swap one measurement for a
 * different one that happens to share a name.
 */
export interface TokenMarketWire {
  symbol: string | null;
  /** On-chain total supply, decimals already applied. */
  totalSupply: number | null;
  /** GeckoTerminal's own FDV: price x total supply. Not PEA's max-supply FDV. */
  fdvUsd: number | null;
  /** Usually null until a CoinGecko listing supplies circulating supply. */
  marketCapUsd: number | null;
  /** 24h SWAP volume. Not the same thing as ETH deployed into rounds. */
  volume24hUsd: number | null;
  /** Total reserve across the token's pools. */
  liquidityUsd: number | null;
}

export interface PriceHistoryWire {
  points: PricePointWire[];
  /** Current spot price of the token in USD, null when unknown. Serves the
   * hero rail and the header ticker so they cannot disagree with the chart. */
  priceUsd: number | null;
  /** The pool the series came from, for debugging a wrong-looking chart. */
  poolAddress: string | null;
  /** Null when the token lookup failed; the caller keeps its own numbers. */
  market: TokenMarketWire | null;
  /** Set when the upstream call failed; the caller falls back to its own data. */
  error?: string;
}

const BASE = "https://api.geckoterminal.com/api/v2";

/** GeckoTerminal is polled on the server; 5 min is well inside its rate limit
 * and far fresher than a daily candle needs. */
const REVALIDATE_S = 300;

async function gt(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_S },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? "GeckoTerminal rate limit"
        : `GeckoTerminal ${res.status}`,
    );
  }
  return res.json();
}

/**
 * Parse a GeckoTerminal numeric string; anything unusable becomes null.
 *
 * The null/empty guard is load-bearing, not defensive noise: `Number(null)` is
 * 0 and 0 is finite, so without it an unknown market cap maps to 0 and the UI
 * states "$0.00" as a fact. GeckoTerminal returns market_cap_usd null for any
 * token without a CoinGecko listing, which is every token pre-launch.
 */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Token-level market facts. Separate endpoint from the pool list. */
export async function fetchTokenMarket(
  token: string,
): Promise<TokenMarketWire | null> {
  try {
    const json = (await gt(`/networks/${GT_NETWORK}/tokens/${token}`)) as {
      data?: {
        attributes?: {
          symbol?: string;
          normalized_total_supply?: string;
          fdv_usd?: string;
          market_cap_usd?: string | null;
          volume_usd?: { h24?: string };
          total_reserve_in_usd?: string;
        };
      };
    };
    const a = json.data?.attributes;
    if (!a) return null;
    return {
      symbol: a.symbol ?? null,
      totalSupply: num(a.normalized_total_supply),
      fdvUsd: num(a.fdv_usd),
      marketCapUsd: num(a.market_cap_usd),
      volume24hUsd: num(a.volume_usd?.h24),
      liquidityUsd: num(a.total_reserve_in_usd),
    };
  } catch {
    return null;
  }
}

/**
 * The deepest pool for a token, by USD reserve.
 *
 * Resolved at request time rather than hardcoded so that swapping
 * CHART_TOKEN_ADDRESS is genuinely a one-line change, and so a token that
 * later migrates to a deeper pool follows automatically.
 */
export async function findDeepestPool(
  token: string,
): Promise<{ address: string; priceUsd: number | null } | null> {
  const json = (await gt(`/networks/${GT_NETWORK}/tokens/${token}/pools`)) as {
    data?: {
      attributes?: {
        address?: string;
        reserve_in_usd?: string;
        base_token_price_usd?: string;
      };
    }[];
  };
  const pools = json.data ?? [];
  let best: { address: string; priceUsd: number | null } | null = null;
  let bestReserve = -1;
  for (const p of pools) {
    const addr = p.attributes?.address;
    if (!addr) continue;
    const reserve = Number(p.attributes?.reserve_in_usd ?? 0);
    if (reserve > bestReserve) {
      bestReserve = reserve;
      const spot = Number(p.attributes?.base_token_price_usd);
      best = {
        address: addr,
        priceUsd: Number.isFinite(spot) && spot > 0 ? spot : null,
      };
    }
  }
  return best;
}

/**
 * Hourly closes for a pool, oldest first.
 *
 * Hourly rather than daily deliberately: a freshly launched pool has only a
 * couple of daily candles, which draws a chart with two points on it. Hourly
 * gives a real curve from day one and still covers ~41 days at the API's
 * 1000-point maximum.
 */
export async function fetchPriceHistory(
  token: string = CHART_TOKEN_ADDRESS,
): Promise<PriceHistoryWire> {
  try {
    // The token lookup is independent of the pool lookup, so run them
    // together rather than paying two round trips in series.
    const [pool, market] = await Promise.all([
      findDeepestPool(token),
      fetchTokenMarket(token),
    ]);
    if (!pool) {
      return {
        points: [],
        priceUsd: null,
        poolAddress: null,
        market,
        error: "no pool for token",
      };
    }
    const json = (await gt(
      `/networks/${GT_NETWORK}/pools/${pool.address}/ohlcv/hour?aggregate=1&limit=1000&currency=usd`,
    )) as {
      data?: { attributes?: { ohlcv_list?: number[][] } };
    };
    const rows = json.data?.attributes?.ohlcv_list ?? [];
    // [unixSeconds, open, high, low, close, volume]; GeckoTerminal returns
    // newest first, our charts read left to right.
    const points: PricePointWire[] = rows
      .filter((r) => Array.isArray(r) && r.length >= 5 && Number.isFinite(r[4]))
      .map((r) => ({ t: r[0] * 1000, v: r[4] }))
      .sort((a, b) => a.t - b.t);
    // Prefer the pool's live spot price; fall back to the newest close so the
    // rail still has a number when only candles came back.
    const priceUsd =
      pool.priceUsd ?? (points.length ? points[points.length - 1].v : null);
    return { points, priceUsd, poolAddress: pool.address, market };
  } catch (e) {
    return {
      points: [],
      priceUsd: null,
      poolAddress: null,
      market: null,
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}
