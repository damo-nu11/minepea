/**
 * Stockpot asset registry — the ADDRESS-ONLY law.
 *
 * Symbol collisions are rampant on this chain: fake tokens shadow real
 * tickers (a counterfeit 18dp "USDG" trades next to the real 6dp one), so
 * every Stockpot view filters by this allowlist of verified addresses and
 * NOTHING ever matches by symbol. All addresses live-verified 2026-07-28:
 * tokens against the chain explorer's official "• Robinhood Token" naming,
 * feeds against the Chainlink registry for chain 4663, pools against the
 * aggregator the repo already uses for the PEA price.
 *
 * Addresses are EIP-55 CANONICAL and test-pinned: viem validates mixed-case
 * checksums strictly, and ONE bad address fails the entire multicall batch
 * (a hand-cased SPCX checksum dashed every price on the tab, 2026-07-28).
 *
 * Feed prices are 8dp, deviation 0.5% / heartbeat 24h, market-hours 24/5:
 * valuation-grade, not a live ticker. The dividend multiplier is already
 * baked into feed prices; uiMultiplier() and oraclePaused() live on the
 * TOKEN contract. paused == true means a corporate action is in progress
 * and the price is untrusted (render dashes, never a stale number).
 */

import type { Address } from "@/lib/types";

export interface StockpotAsset {
  ticker: string;
  name: string;
  /** Official Robinhood stock token (18 decimals). */
  token: Address;
  /** Chainlink AggregatorV3 proxy, USD, 8 decimals. */
  feed: Address;
  /**
   * Canonical pool for price-history charts (v3 pool address or v4 poolId,
   * both accepted in the same aggregator path slot).
   */
  pool: string;
  /** False = value off the feed but render no price chart. */
  chartable: boolean;
  /** Self-hosted logo under public/ (user-supplied 2026-07-28); tickers
   * without one render the typographic monogram tile. */
  icon?: string;
}

export const STOCKPOT_ASSETS: readonly StockpotAsset[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
    pool: "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3",
    chartable: true,
    icon: "/stocks/nvda.png",
  },
  {
    ticker: "TSLA",
    name: "Tesla",
    token: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    feed: "0x4A1166a659A55625345e9515b32adECea5547C38",
    pool: "0x8517f8071ae5b831b738052f12125e8e3d6c158b78728aa44ce3b25e5104d32e",
    chartable: true,
    icon: "/stocks/tsla.png",
  },
  {
    ticker: "AAPL",
    name: "Apple",
    token: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    feed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
    pool: "0x783C9bbb765047CFDD2b84B92b2CA9F11D34b7Ed",
    chartable: true,
    icon: "/stocks/aapl.png",
  },
  {
    ticker: "GOOGL",
    name: "Alphabet",
    token: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
    feed: "0xF6f373a037c30F0e5010d854385cA89185AE638b",
    pool: "0xd4ecb79fdc521d7725d22b33ed43cb4e47aa96bfad76aa29577e3151f723ac5e",
    chartable: true,
    icon: "/stocks/googl.png",
  },
  {
    ticker: "SPCX",
    name: "SpaceX",
    token: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
    feed: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb",
    pool: "0xC61284332117c3Fb23A2a56ccefFD07F7aF60029",
    chartable: true,
    icon: "/stocks/spcx.png",
  },
];

/** The real USDG (6 decimals). A counterfeit 18dp USDG exists; see above. */
export const USDG: { address: Address; decimals: number } = {
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  decimals: 6,
};

/**
 * The Stockpot addresses (dev, 2026-07-28; audit-corrected same day).
 * Flow: the ETH side of LP fees earned during US market hours buys
 * tokenized stocks; the stocks sit in the POT between peapot hits; a hit
 * sweeps them out to the recipients.
 *
 * CONFIRMED LIVE ONCHAIN: buy batches landed at the 2026-07-27 close
 * (19:54 + 20:00 UTC, all five registry tickers); TWO fan-out payouts
 * followed (19:54-19:55, 10 recipients; 23:51, 8 recipients), leaving wei
 * dust. The POT is an EOA (a hot key), not a contract: it signs
 * `execute`, `collect` and `disperseToken` itself. Buy txs TARGET the
 * UniversalRouter (0x8876789976dEcBfCbBbe364623C63652db8C0904) but the
 * stock transfer legs ARRIVE FROM the v4 PoolManager below, which
 * custodies every v4 pool's tokens (it also sources the PEA `collect` leg
 * the allowlist filters out). A buy routed through a V3 pool arrives from
 * THAT POOL's address instead, so the assembler accepts inbound stock
 * from the PoolManager or any registry v3 pool. Sample real buy tx
 * (SPCX): 0x335b7ce29a5a193cb193f5c3d7867867c0f5722102667fe802416d03abf797d6
 * — the ledger decode is pinned against it.
 */
export const STOCKPOT_PERIPHERY = {
  /** Collects the LP fees that fund the pot. Holds no funds. */
  feeCollector: "0x55385BAA862CCfdbCB449293005dFAD16c8FAf29" as Address,
  /** Multisends stock tokens out on payouts. Holds no funds. */
  disperser: "0x6c66ba7666dd239c392C269D19A2B2EB40D9F5d8" as Address,
  /** THE POT: executes buys and holds the stocks between peapot hits. */
  pot: "0x81422835B3c7eCA4edB95Ad028b0d95BE87A2F50" as Address,
  /** The Uniswap v4 PoolManager (formerly mislabeled as the buy router):
   * the singleton custodian that v4-routed buy transfers arrive from. */
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address,
};

/**
 * The ledger's production start. The pot's activity at 12:16-12:17 UTC on
 * 2026-07-27 was the dev's TEST run (tiny buys, an $18.99 fan-out to 3
 * wallets); the user ruled it out of every view (2026-07-28). The first
 * real cycle began at that day's market close.
 */
export const STOCKPOT_LEDGER_START_MS = Date.UTC(2026, 6, 27, 13, 0);

/**
 * Transactions ruled OUT of every view individually (post-launch dev
 * tests and the like). The time cutoff above covers pre-launch testing;
 * this set exists so a FUTURE test can be excluded the moment it happens
 * instead of contaminating production views until a code change ships.
 * Keep hashes lowercase.
 */
export const STOCKPOT_EXCLUDED_TX: ReadonlySet<string> = new Set<string>([]);

/**
 * Addresses buy transfers may legitimately arrive FROM: the v4
 * PoolManager plus every registry v3 pool (v4 poolIds are 32-byte ids,
 * not addresses, and can never be a transfer party). Lowercased.
 */
export const STOCKPOT_BUY_SOURCES: ReadonlySet<string> = new Set<string>([
  STOCKPOT_PERIPHERY.poolManager.toLowerCase(),
  ...STOCKPOT_ASSETS.filter((a) => a.pool.length === 42).map((a) =>
    a.pool.toLowerCase(),
  ),
]);

/** Fast lookup by token address (lowercased key — the only matching rule). */
export const ASSET_BY_TOKEN: ReadonlyMap<string, StockpotAsset> = new Map(
  STOCKPOT_ASSETS.map((a) => [a.token.toLowerCase(), a]),
);
