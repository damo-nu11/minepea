/**
 * Pins for the RPC failover introduced after the balance incident
 * (2026-07-25): four users whose networks could reach the game API but not
 * the one official RPC host saw every balance on the site dead, because
 * balances were a single-host read with no fallback and no retry.
 */

import { describe, expect, it } from "vitest";
import { balanceRetryDelayMs } from "@/lib/balanceRetry";
import { CHAIN, chainReadTransport, RPC_URL, RPC_URLS } from "@/lib/contracts";

describe("RPC_URLS", () => {
  it("starts with the configured primary and keeps the verified fallbacks", () => {
    expect(RPC_URLS[0]).toBe(RPC_URL);
    expect(RPC_URLS).toContain("https://robinhood-chain.gateway.tenderly.co");
    expect(RPC_URLS).toContain("https://robinhood-rpc.publicnode.com");
    expect(RPC_URLS).toContain("https://rpc.mainnet.chain.robinhood.com/");
  });

  it("holds more than one host, or the failover is a no-op", () => {
    expect(RPC_URLS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(RPC_URLS).size).toBe(RPC_URLS.length);
  });
});

describe("chainReadTransport", () => {
  it("is a fallback over every host in RPC_URLS", () => {
    const t = chainReadTransport()({ chain: CHAIN });
    expect(t.config.type).toBe("fallback");
    const transports = (t.value as { transports: unknown[] }).transports;
    expect(transports).toHaveLength(RPC_URLS.length);
  });
});

describe("balanceRetryDelayMs", () => {
  it("doubles from 2s and caps at 30s", () => {
    expect(balanceRetryDelayMs(0)).toBe(2_000);
    expect(balanceRetryDelayMs(1)).toBe(4_000);
    expect(balanceRetryDelayMs(2)).toBe(8_000);
    expect(balanceRetryDelayMs(3)).toBe(16_000);
    expect(balanceRetryDelayMs(4)).toBe(30_000);
  });

  it("stays at the cap forever, including absurd attempt counts", () => {
    // 2 ** bigAttempt is Infinity without the clamp; the schedule must stay
    // a finite 30s so an overnight outage keeps retrying, not NaN-ing.
    expect(balanceRetryDelayMs(100)).toBe(30_000);
    expect(Number.isFinite(balanceRetryDelayMs(10_000))).toBe(true);
  });

  it("treats a negative attempt as the first", () => {
    expect(balanceRetryDelayMs(-1)).toBe(2_000);
  });
});
