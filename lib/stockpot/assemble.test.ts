/**
 * Assembler pins, anchored on a FROZEN REAL transfer from the live pot: if
 * the mechanism's onchain shape ever changes (router swap, transfer
 * direction, field names), these go red instead of the page going quietly
 * wrong. Plus the classification law: nothing outside the allowlist, no
 * inbound from strangers, payouts only out of the pot.
 */

import { describe, expect, it } from "vitest";
import {
  assembleLedger,
  closeByDay,
  dayKey,
  priceForDay,
  type ExplorerTransferItem,
} from "@/lib/stockpot/assemble";
import { STOCKPOT_ASSETS } from "@/lib/stockpot/registry";

const SPCX = STOCKPOT_ASSETS.find((a) => a.ticker === "SPCX")!;
const NVDA = STOCKPOT_ASSETS.find((a) => a.ticker === "NVDA")!;
const POT = "0x81422835B3c7eCA4edB95Ad028b0d95BE87A2F50";
const ROUTER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

/** The SPCX buy leg of the live pot's 2026-07-27 close batch, exactly as
 * the explorer served it on 2026-07-28. */
const REAL_BUY: ExplorerTransferItem = {
  transaction_hash:
    "0x335b7ce29a5a193cb193f5c3d7867867c0f5722102667fe802416d03abf797d6",
  timestamp: "2026-07-27T20:00:10.000000Z",
  from: { hash: ROUTER },
  to: { hash: POT },
  token: { address_hash: "0x4a0E65A3ECcec6DbE60AE065F2e7bb85faE35eEA" },
  total: { value: "78385650021931583" },
};

const T_CLOSE = Date.parse("2026-07-27T20:00:00Z");
const SPCX_HISTORY = { SPCX: [{ t: T_CLOSE, v: 221.5 }] };

describe("assembleLedger", () => {
  it("classifies the recorded REAL buy and prices it at the day close", () => {
    const { purchases, payouts } = assembleLedger([REAL_BUY], SPCX_HISTORY);
    expect(payouts).toHaveLength(0);
    expect(purchases).toHaveLength(1);
    const p = purchases[0];
    expect(p.txHash).toBe(REAL_BUY.transaction_hash);
    expect(p.token).toBe(SPCX.token); // registry-checksummed, address-keyed
    expect(p.sharesWei).toBe("78385650021931583");
    expect(p.atMs).toBe(Date.parse(REAL_BUY.timestamp));
    expect(p.dayCloseUsd8).toBe("22150000000"); // $221.50 as raw 8dp
  });

  it("ignores everything the allowlist and direction rules exclude", () => {
    const items: ExplorerTransferItem[] = [
      // WETH funding leg: unknown token.
      {
        ...REAL_BUY,
        token: { address_hash: "0x0000000000000000000000000000000000000001" },
      },
      // Counterfeit NVDA at a wrong address (symbol never matters).
      {
        ...REAL_BUY,
        token: { address_hash: "0x000000000000000000000000000000000000dEaD" },
      },
      // Inbound REAL stock from a stranger: a deposit, not a buy.
      {
        ...REAL_BUY,
        from: { hash: "0x00000000000000000000000000000000000000AA" },
        token: { address_hash: NVDA.token },
      },
      // Outbound to the router (an internal shuffle, not a payout).
      {
        ...REAL_BUY,
        from: { hash: POT },
        to: { hash: ROUTER },
        token: { address_hash: NVDA.token },
      },
    ];
    const { purchases, payouts } = assembleLedger(items, SPCX_HISTORY);
    expect(purchases).toHaveLength(0);
    expect(payouts).toHaveLength(0);
  });

  it("accepts a buy arriving from a registry v3 pool", () => {
    // v3-routed fills deliver from the POOL, not the v4 PoolManager
    // (audit: the old router-only rule silently dropped them as strangers).
    const { purchases, payouts } = assembleLedger(
      [
        {
          ...REAL_BUY,
          from: { hash: NVDA.pool },
          token: { address_hash: NVDA.token },
        },
      ],
      {},
    );
    expect(purchases).toHaveLength(1);
    expect(payouts).toHaveLength(0);
  });

  it("excludes transactions ruled out by hash", () => {
    const { purchases } = assembleLedger(
      [REAL_BUY],
      SPCX_HISTORY,
      new Set([REAL_BUY.transaction_hash.toLowerCase()]),
    );
    expect(purchases).toHaveLength(0);
  });

  it("excludes the pre-launch dev-test activity entirely", () => {
    // The 12:16-12:17 UTC run on 2026-07-27 was a test (user 2026-07-28).
    const testBuy: ExplorerTransferItem = {
      ...REAL_BUY,
      timestamp: "2026-07-27T12:16:00.000000Z",
    };
    const testPayout: ExplorerTransferItem = {
      ...REAL_BUY,
      timestamp: "2026-07-27T12:17:00.000000Z",
      from: { hash: POT },
      to: { hash: "0x00000000000000000000000000000000000000B9" },
    };
    const { purchases, payouts } = assembleLedger(
      [testBuy, testPayout],
      SPCX_HISTORY,
    );
    expect(purchases).toHaveLength(0);
    expect(payouts).toHaveLength(0);
  });

  it("turns outbound stock legs into payout legs, newest first", () => {
    const legAt = (iso: string, to: string): ExplorerTransferItem => ({
      transaction_hash: "0xfanout",
      timestamp: iso,
      from: { hash: POT },
      to: { hash: to },
      token: { address_hash: NVDA.token },
      total: { value: "1000000000000000000" },
    });
    const { payouts } = assembleLedger(
      [
        legAt(
          "2026-07-27T23:51:49.000000Z",
          "0x00000000000000000000000000000000000000B1",
        ),
        legAt(
          "2026-07-27T23:51:49.000000Z",
          "0x00000000000000000000000000000000000000B2",
        ),
      ],
      {},
    );
    expect(payouts).toHaveLength(2);
    expect(payouts[0].winner).not.toBe(payouts[1].winner);
    expect(payouts[0].token).toBe(NVDA.token);
  });
});

describe("day pricing", () => {
  it("uses the exact day close, then the nearest earlier close", () => {
    const closes = closeByDay([
      { t: T_CLOSE - 2 * 86_400_000, v: 200 },
      { t: T_CLOSE, v: 221.5 },
    ]);
    expect(priceForDay(closes, T_CLOSE + 60_000)).toBe(221.5);
    // The next day has no candle: fall back to the 27th's close.
    expect(priceForDay(closes, T_CLOSE + 86_400_000)).toBe(221.5);
    // A day between candles falls back to the earlier one.
    expect(priceForDay(closes, T_CLOSE - 86_400_000)).toBe(200);
  });

  it("gives 0 (a dash-costed row) beyond the lookback, never a guess", () => {
    const closes = closeByDay([{ t: T_CLOSE, v: 221.5 }]);
    expect(priceForDay(closes, T_CLOSE + 30 * 86_400_000)).toBe(0);
  });

  it("day buckets are UTC-stable", () => {
    expect(dayKey(T_CLOSE)).toBe(dayKey(T_CLOSE + 3 * 3_600_000));
    expect(dayKey(T_CLOSE)).not.toBe(dayKey(T_CLOSE + 5 * 3_600_000));
  });
});
