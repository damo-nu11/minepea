/**
 * Stockpot P0 pins: the average-cost math (exact), the honesty gates (a
 * missing or paused price never prints a number, a partial total never
 * prints at all), the allowlist law (counterfeit tokens contribute
 * nothing), and the mock's determinism + market-hours shape.
 */

import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { buildStockpotMock, STOCKPOT_MOCK } from "@/lib/mock/stockpot";
import {
  buyCostUsd,
  paidOutSharesByToken,
  pendingPotUsd,
  positionsFromFlows,
  potTotalUsd,
  price8ToUsd,
} from "@/lib/stockpot/math";
import { toStockpotVM } from "@/lib/stockpot/mappers";
import {
  STOCKPOT_ASSETS,
  STOCKPOT_PERIPHERY,
  USDG,
} from "@/lib/stockpot/registry";
import type { StockpotWire } from "@/lib/stockpot/types";
import type { Address } from "@/lib/types";

const NVDA = STOCKPOT_ASSETS[0];
const TSLA = STOCKPOT_ASSETS[1];
const FAKE_TOKEN = "0x000000000000000000000000000000000000dEaD" as Address;

const wei = (shares: number) => (BigInt(shares) * BigInt(1e18)).toString();
const price8 = (usd: number) => String(Math.round(usd * 1e8));

/** A buy of `shares` shares costing `usd` total (day close = usd/shares). */
function buy(token: Address, shares: number, usd: number, atMs: number) {
  return {
    txHash: "0xbuy",
    atMs,
    token,
    sharesWei: wei(shares),
    dayCloseUsd8: price8(usd / shares),
  };
}

describe("registry address integrity", () => {
  it("every address is EIP-55 canonical (one bad checksum fails the whole multicall)", () => {
    const all = [
      ...STOCKPOT_ASSETS.flatMap((a) => [a.token, a.feed]),
      USDG.address,
      STOCKPOT_PERIPHERY.feeCollector,
      STOCKPOT_PERIPHERY.disperser,
      STOCKPOT_PERIPHERY.pot,
      STOCKPOT_PERIPHERY.poolManager,
    ];
    for (const a of all) expect(getAddress(a.toLowerCase()), a).toBe(a);
  });
});

describe("stockpot math", () => {
  it("raw decoders are exact", () => {
    expect(price8ToUsd("19316500000")).toBe(193.165);
    // 10 shares at a $150 day close cost $1,500.
    expect(buyCostUsd(buy(NVDA.token, 10, 1500, 0))).toBeCloseTo(1500, 9);
  });

  it("average-cost method: buys re-average, payouts remove at average", () => {
    const positions = positionsFromFlows(
      [
        buy(NVDA.token, 10, 1000, 1_000), // $100/sh
        buy(NVDA.token, 10, 2000, 2_000), // avg now $150/sh
      ],
      [
        {
          txHash: "0xout",
          atMs: 3_000,
          token: NVDA.token,
          sharesWei: wei(5),
          winner: FAKE_TOKEN,
        },
      ],
    );
    const pos = positions.get(NVDA.token.toLowerCase())!;
    expect(pos.shares).toBeCloseTo(15, 9);
    expect(pos.costUsd).toBeCloseTo(2250, 9); // 5 shares left at $150 avg
    expect(pos.buyCount).toBe(2);
  });

  it("events apply in TIME order even though the wire is newest-first", () => {
    // Payout arrives between the two buys: it must remove at the $100
    // average of the FIRST buy only, not the blended average.
    const positions = positionsFromFlows(
      [
        buy(NVDA.token, 10, 2000, 3_000), // later buy, listed first
        buy(NVDA.token, 10, 1000, 1_000),
      ],
      [
        {
          txHash: "0xout",
          atMs: 2_000,
          token: NVDA.token,
          sharesWei: wei(5),
          winner: FAKE_TOKEN,
        },
      ],
    );
    const pos = positions.get(NVDA.token.toLowerCase())!;
    expect(pos.shares).toBeCloseTo(15, 9);
    expect(pos.costUsd).toBeCloseTo(500 + 2000, 9); // 5x$100 left + later buy
  });

  it("a payout can never drive a position negative", () => {
    const positions = positionsFromFlows(
      [buy(NVDA.token, 2, 200, 1_000)],
      [
        {
          txHash: "0xout",
          atMs: 2_000,
          token: NVDA.token,
          sharesWei: wei(5),
          winner: FAKE_TOKEN,
        },
      ],
    );
    const pos = positions.get(NVDA.token.toLowerCase())!;
    expect(pos.shares).toBe(0);
    expect(pos.costUsd).toBe(0);
  });

  it("paid-out shares aggregate across legs per token", () => {
    const leg = (token: Address, shares: number, atMs: number) => ({
      txHash: "0xleg",
      atMs,
      token,
      sharesWei: wei(shares),
      winner: FAKE_TOKEN,
    });
    const m = paidOutSharesByToken([
      leg(NVDA.token, 2, 1),
      leg(NVDA.token, 3, 2),
      leg(TSLA.token, 1, 3),
    ]);
    expect(m.get(NVDA.token.toLowerCase())).toBeCloseTo(5, 9);
    expect(m.get(TSLA.token.toLowerCase())).toBeCloseTo(1, 9);
  });

  it("the pot total is null unless EVERY held asset has a live price", () => {
    const positions = positionsFromFlows(
      [buy(NVDA.token, 10, 1000, 1_000), buy(TSLA.token, 2, 600, 2_000)],
      [],
    );
    const both = new Map<string, number | null>([
      [NVDA.token.toLowerCase(), 200],
      [TSLA.token.toLowerCase(), 310],
    ]);
    expect(potTotalUsd(positions, both)).toBeCloseTo(10 * 200 + 2 * 310, 9);
    const missingOne = new Map(both);
    missingOne.delete(TSLA.token.toLowerCase());
    expect(potTotalUsd(positions, missingOne)).toBeNull();
  });
});

describe("stockpot mapper honesty gates", () => {
  const wire: StockpotWire = {
    snapshot: {
      asOfMs: 1_753_600_000_000,
      prices: [
        { token: NVDA.token, priceUsd8: price8(200), paused: false },
        { token: TSLA.token, priceUsd8: price8(310), paused: true },
        // Counterfeit token: allowlist must drop it entirely.
        { token: FAKE_TOKEN, priceUsd8: price8(9_999), paused: false },
      ],
    },
    purchases: [
      buy(TSLA.token, 2, 600, 2_000),
      buy(NVDA.token, 10, 1000, 1_000),
    ],
    payouts: [],
  };
  const vm = toStockpotVM(wire);

  it("a paused feed renders dashes, never a stale number", () => {
    const v = toStockpotVM({
      ...wire,
      payouts: [
        {
          txHash: "0xout",
          atMs: 3_000,
          token: TSLA.token,
          sharesWei: wei(1),
          winner: FAKE_TOKEN,
        },
        {
          txHash: "0xout2",
          atMs: 3_000,
          token: NVDA.token,
          sharesWei: wei(4),
          winner: FAKE_TOKEN,
        },
      ],
    });
    const tsla = v.stocks.find((s) => s.ticker === "TSLA")!;
    expect(tsla.paused).toBe(true);
    expect(tsla.priceFormatted).toBe("—");
    // Swept shares are ledger facts; their USD value needs the price.
    expect(tsla.paidOutShares).toBeCloseTo(1, 9);
    expect(tsla.paidOutUsdFormatted).toBe("—");
    const nvda = v.stocks.find((s) => s.ticker === "NVDA")!;
    expect(nvda.paidOutUsd).toBeCloseTo(4 * 200, 9);
    // A stock that never swept reads a true zero, not a dash.
    const aapl = v.stocks.find((s) => s.ticker === "AAPL")!;
    expect(aapl.paidOutUsdFormatted).toBe("$0.00");
  });

  it("the headline total refuses a partial sum", () => {
    expect(vm.totalUsd).toBeNull();
    expect(vm.totalUsdFormatted).toBe("—");
  });

  it("deployed sums the ledger regardless of price availability", () => {
    expect(vm.deployedUsd).toBeCloseTo(1600, 9);
  });

  it("keeps every registry asset visible, swept-empty included", () => {
    // Only two tickers have flows in this wire; all five still row up —
    // the pot drains on every hit, so zero is a state, not an absence.
    expect(vm.stocks).toHaveLength(STOCKPOT_ASSETS.length);
  });

  it("pending splits the pot's ETH evenly and converts at live prices", () => {
    // The user's formula (2026-07-28): USD sitting in LP divided by five
    // (each stock 20%), then what that buys at the live price; anything
    // already held counts on top.
    const v = toStockpotVM(
      {
        snapshot: {
          asOfMs: 0,
          prices: [
            { token: NVDA.token, priceUsd8: price8(200), paused: false },
            { token: TSLA.token, priceUsd8: price8(310), paused: false },
          ],
        },
        purchases: [],
        payouts: [],
      },
      {
        pending: {
          marketOpen: true,
          pendingEthWei: wei(1),
          pendingStocks: [{ address: NVDA.token, amountWei: wei(2) }],
          updatedAtMs: 0,
          stale: false,
        },
        ethUsd: 1900,
      },
    );
    const slice = 1900 / STOCKPOT_ASSETS.length;
    const nvda = v.stocks.find((s) => s.ticker === "NVDA")!;
    expect(nvda.pendingUsd).toBeCloseTo(2 * 200 + slice, 9);
    expect(nvda.pendingShares).toBeCloseTo(2 + slice / 200, 9);
    const tsla = v.stocks.find((s) => s.ticker === "TSLA")!;
    expect(tsla.pendingUsd).toBeCloseTo(slice, 9);
    expect(tsla.pendingShares).toBeCloseTo(slice / 310, 9);
    // A stock without a live feed still knows its ETH slice in USD; only
    // the share count it would buy is unknown.
    const aapl = v.stocks.find((s) => s.ticker === "AAPL")!;
    expect(aapl.pendingUsd).toBeCloseTo(slice, 9);
    expect(aapl.pendingShares).toBeNull();
    // The rows decompose THE POT headline exactly.
    const sum = v.stocks.reduce((a, s) => a + (s.pendingUsd ?? 0), 0);
    expect(sum).toBeCloseTo(v.totalUsd!, 9);
  });

  it("pending is unknown without the fresh feed or the ETH quote, never zero", () => {
    const w: StockpotWire = {
      snapshot: {
        asOfMs: 0,
        prices: [{ token: NVDA.token, priceUsd8: price8(200), paused: false }],
      },
      purchases: [],
      payouts: [],
    };
    const noFeed = toStockpotVM(w);
    for (const s of noFeed.stocks) {
      expect(s.pendingUsd).toBeNull();
      expect(s.pendingUsdFormatted).toBe("—");
    }
    const staleBase = {
      marketOpen: true,
      pendingEthWei: wei(1),
      pendingStocks: [],
      updatedAtMs: 0,
    };
    const staleFeed = toStockpotVM(w, {
      pending: { ...staleBase, stale: true },
      ethUsd: 1900,
    });
    for (const s of staleFeed.stocks) expect(s.pendingUsd).toBeNull();
    const noQuote = toStockpotVM(w, {
      pending: { ...staleBase, stale: false },
      ethUsd: 0,
    });
    for (const s of noQuote.stocks) expect(s.pendingUsd).toBeNull();
  });

  it("groups payout legs into one event per HIT across the disperser's txs", () => {
    // The disperser sends each stock in its OWN tx seconds apart (verified
    // live), so events cluster by time window, never by tx hash.
    const leg = (tx: string, atMs: number, winner: string) => ({
      txHash: tx,
      atMs,
      token: NVDA.token,
      sharesWei: wei(1),
      winner: winner as Address,
    });
    const W1 = "0x00000000000000000000000000000000000000b1";
    const W2 = "0x00000000000000000000000000000000000000b2";
    const grouped = toStockpotVM({
      snapshot: {
        asOfMs: 0,
        prices: [{ token: NVDA.token, priceUsd8: price8(200), paused: false }],
      },
      purchases: [buy(NVDA.token, 10, 1000, 1_000)],
      payouts: [
        // Newest first: one hit spread across three txs seconds apart...
        leg("0xtx3", 100_000, W1),
        leg("0xtx2", 99_000, W2),
        leg("0xtx1", 98_000, W1),
        // ...and an older hit hours before it.
        leg("0xold", 100_000 - 4 * 3_600_000, W1),
      ],
    });
    expect(grouped.payoutEvents).toHaveLength(2);
    const hit = grouped.payoutEvents[0];
    expect(hit.txCount).toBe(3);
    expect(hit.recipients).toBe(2);
    expect(hit.stocks[0].shares).toBeCloseTo(3, 9);
    expect(hit.valueUsd).toBeCloseTo(600, 9);
    expect(grouped.payoutEvents[1].txCount).toBe(1);
  });

  it("a zero feed answer reads as unknown, never a $0 price", () => {
    // Audit 2026-07-28 (found three times over): a failed feed encoded as
    // price "0" with paused false painted value $0.00, a fake total-loss
    // P&L, and an understated headline.
    const v = toStockpotVM({
      snapshot: {
        asOfMs: 0,
        prices: [
          { token: NVDA.token, priceUsd8: "0", paused: false },
          { token: TSLA.token, priceUsd8: price8(310), paused: false },
        ],
      },
      purchases: [
        buy(NVDA.token, 10, 1000, 1_000),
        buy(TSLA.token, 2, 600, 2_000),
      ],
      payouts: [],
    });
    const nvda = v.stocks.find((s) => s.ticker === "NVDA")!;
    expect(nvda.priceFormatted).toBe("—");
    expect(nvda.priceUsd).toBeNull();
    expect(v.totalUsd).toBeNull();
  });

  it("wei dust reads as exactly empty and cannot hold the headline hostage", () => {
    // Disperser sweeps leave 4-5 wei per ticker; without the clamp those
    // wei rendered phantom avg-cost lines and dust P&L, and a paused feed
    // on 5e-18 shares dashed the whole headline (audit, live on the page).
    const dustWei = (BigInt(10) * BigInt(1e18) - BigInt(5)).toString();
    const v = toStockpotVM({
      snapshot: {
        asOfMs: 0,
        prices: [
          { token: NVDA.token, priceUsd8: price8(200), paused: true },
          { token: TSLA.token, priceUsd8: price8(310), paused: false },
        ],
      },
      purchases: [
        buy(NVDA.token, 10, 1000, 1_000),
        buy(TSLA.token, 2, 600, 2_000),
      ],
      payouts: [
        {
          txHash: "0xsweep",
          atMs: 3_000,
          token: NVDA.token,
          sharesWei: dustWei,
          winner: FAKE_TOKEN,
        },
      ],
    });
    const nvda = v.stocks.find((s) => s.ticker === "NVDA")!;
    expect(nvda.avgCostPerShare).toBeNull();
    // The paused, dusty position no longer poisons the all-or-nothing total.
    expect(v.totalUsd).toBeCloseTo(2 * 310, 9);
  });

  it("an unpriced buy dashes the position's cost story and DEPLOYED", () => {
    const v = toStockpotVM({
      snapshot: {
        asOfMs: 0,
        prices: [{ token: NVDA.token, priceUsd8: price8(200), paused: false }],
      },
      purchases: [
        buy(NVDA.token, 10, 1000, 1_000),
        {
          txHash: "0xunpriced",
          atMs: 2_000,
          token: NVDA.token,
          sharesWei: wei(10),
          dayCloseUsd8: "0",
        },
      ],
      payouts: [],
    });
    const nvda = v.stocks.find((s) => s.ticker === "NVDA")!;
    // The chart's average-cost reference dashes rather than dilutes.
    expect(nvda.avgCostPerShare).toBeNull();
    expect(v.deployedUsd).toBeNull();
    expect(v.deployedUsdFormatted).toBe("—");
  });

  it("a same-instant buy and sweep fold buy-first", () => {
    // Explorer timestamps are second-granular and sweeps trail buys by
    // seconds; the comparator's kind tie-break keeps the fold correct.
    const positions = positionsFromFlows(
      [buy(NVDA.token, 10, 1000, 5_000)],
      [
        {
          txHash: "0xout",
          atMs: 5_000,
          token: NVDA.token,
          sharesWei: wei(10),
          winner: FAKE_TOKEN,
        },
      ],
    );
    const pos = positions.get(NVDA.token.toLowerCase())!;
    expect(pos.shares).toBe(0);
    expect(pos.costUsd).toBe(0);
  });

  it("the headline is WHOLE dollars when every price exists", () => {
    const live: StockpotWire = {
      ...wire,
      snapshot: {
        ...wire.snapshot,
        prices: [
          { token: NVDA.token, priceUsd8: price8(200.4), paused: false },
          { token: TSLA.token, priceUsd8: price8(310), paused: false },
        ],
      },
    };
    const v = toStockpotVM(live);
    // 10*200.4 + 2*310 = 2624 — whole dollars, no cents column.
    expect(v.totalUsdFormatted).toBe("$2,624");
  });
});

describe("the pending pot feed (THE POT's live source)", () => {
  const PRICES = new Map<string, number | null>([
    [NVDA.token.toLowerCase(), 200],
    [TSLA.token.toLowerCase(), 310],
  ]);
  const base = {
    marketOpen: true,
    pendingEthWei: "0",
    pendingStocks: [] as { address: string; amountWei: string }[],
    updatedAtMs: 0,
    stale: false,
  };

  it("values held stocks at feed prices plus accruing ETH", () => {
    const p = {
      ...base,
      pendingEthWei: wei(1),
      pendingStocks: [{ address: NVDA.token, amountWei: wei(2) }],
    };
    expect(pendingPotUsd(p, PRICES, 1900)).toBeCloseTo(2 * 200 + 1900, 9);
  });

  it("dust components contribute exactly zero", () => {
    // The real resting state: 4-5 wei of stock and 1 wei of ETH.
    const p = {
      ...base,
      pendingEthWei: "1",
      pendingStocks: [{ address: NVDA.token, amountWei: "5" }],
    };
    expect(pendingPotUsd(p, PRICES, 0)).toBe(0);
  });

  it("all-or-nothing: any non-dust component without a price nulls it", () => {
    const noStockPrice = {
      ...base,
      pendingStocks: [{ address: NVDA.token, amountWei: wei(1) }],
    };
    expect(pendingPotUsd(noStockPrice, new Map(), 1900)).toBeNull();
    const noEthPrice = { ...base, pendingEthWei: wei(1) };
    expect(pendingPotUsd(noEthPrice, PRICES, 0)).toBeNull();
  });

  it("the mapper prefers fresh pending and falls back on stale", () => {
    const wire: StockpotWire = {
      snapshot: {
        asOfMs: 0,
        prices: [{ token: NVDA.token, priceUsd8: price8(200), paused: false }],
      },
      purchases: [buy(NVDA.token, 10, 1000, 1_000)],
      payouts: [],
    };
    const fresh = toStockpotVM(wire, {
      pending: {
        ...base,
        pendingStocks: [{ address: NVDA.token, amountWei: wei(3) }],
      },
      ethUsd: 1900,
    });
    expect(fresh.totalUsd).toBeCloseTo(600, 9); // pending 3 sh, not flow 10
    expect(fresh.marketOpen).toBe(true);
    const stale = toStockpotVM(wire, {
      pending: { ...base, stale: true },
      ethUsd: 1900,
    });
    expect(stale.totalUsd).toBeCloseTo(2000, 9); // flow-derived
    expect(stale.marketOpen).toBeNull();
  });
});

describe("stockpot mock bundle", () => {
  it("is deterministic for a given seed", () => {
    expect(JSON.stringify(buildStockpotMock(11))).toBe(
      JSON.stringify(buildStockpotMock(11)),
    );
    expect(JSON.stringify(buildStockpotMock(12))).not.toBe(
      JSON.stringify(buildStockpotMock(11)),
    );
  });

  it("every buy lands inside US market hours on a weekday", () => {
    for (const p of STOCKPOT_MOCK.purchases) {
      const d = new Date(p.atMs);
      const dow = d.getUTCDay();
      const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
      expect(minutes).toBeGreaterThanOrEqual(810); // 13:30 UTC
      expect(minutes).toBeLessThan(1200); // 20:00 UTC
    }
  });

  it("only allowlisted tokens appear, and the pot reconciles", () => {
    const allowed = new Set(
      STOCKPOT_ASSETS.map((a) => a.token.toLowerCase()),
    );
    for (const p of STOCKPOT_MOCK.purchases)
      expect(allowed.has(p.token.toLowerCase())).toBe(true);
    for (const p of STOCKPOT_MOCK.payouts)
      expect(allowed.has(p.token.toLowerCase())).toBe(true);

    const vm = toStockpotVM(STOCKPOT_MOCK);
    expect(vm.buyCount).toBeGreaterThan(80);
    expect(vm.payouts.length).toBeGreaterThan(0);
    expect(vm.totalUsd).not.toBeNull();
    for (const s of vm.stocks) {
      expect(s.paidOutShares).toBeGreaterThanOrEqual(0);
    }
    // The mock's payout events sweep real amounts, so the per-stock
    // paid-out figures populate.
    expect(vm.stocks.some((s) => s.paidOutShares > 0)).toBe(true);
    // Wire ordering contract: newest first.
    for (let i = 1; i < STOCKPOT_MOCK.purchases.length; i++) {
      expect(STOCKPOT_MOCK.purchases[i - 1].atMs).toBeGreaterThanOrEqual(
        STOCKPOT_MOCK.purchases[i].atMs,
      );
    }
  });
});
