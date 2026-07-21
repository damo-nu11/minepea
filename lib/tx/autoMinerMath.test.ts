import { describe, expect, it } from "vitest";
import {
  depositFor,
  derivedAmountPerBlock,
  feePerRound,
} from "./autoMinerMath";

const ETH = 10n ** 18n;
const GWEI = 10n ** 9n;

describe("autoMinerMath", () => {
  it("percentage branch: deposit round-trips through the contract derivation", () => {
    // 1% executor fee, negligible flat fee → pct fee wins.
    const perBlock = 25n * GWEI * 100n; // 0.0000025 ETH (MIN_DEPLOY)
    const r = depositFor(perBlock, 25, 10, 100n, 0n);
    expect(r.effectiveAmountPerBlock).toBeGreaterThanOrEqual(perBlock);
    expect(
      derivedAmountPerBlock(r.deposit, 25n, 10n, 100n, 0n),
    ).toBe(r.effectiveAmountPerBlock);
    // Deposit covers the contract's own sufficiency check:
    // (deployPerRound + feePerRound) × rounds ≤ msg.value
    const deployPerRound = r.effectiveAmountPerBlock * 25n;
    expect((deployPerRound + r.feePerRound) * 10n).toBeLessThanOrEqual(
      r.deposit,
    );
  });

  it("flat-fee branch: small deploys where the flat fee overrides", () => {
    const perBlock = 25n * GWEI * 100n;
    const flatFee = ETH / 100n; // 0.01 ETH flat — dwarfs the pct fee
    const r = depositFor(perBlock, 2, 3, 100n, flatFee);
    expect(r.effectiveAmountPerBlock).toBeGreaterThanOrEqual(perBlock);
    expect(r.feePerRound).toBe(flatFee);
    expect(derivedAmountPerBlock(r.deposit, 2n, 3n, 100n, flatFee)).toBe(
      r.effectiveAmountPerBlock,
    );
    expect((r.effectiveAmountPerBlock * 2n + flatFee) * 3n).toBeLessThanOrEqual(
      r.deposit,
    );
  });

  it("zero fees: deposit is exactly perBlock × blocks × rounds", () => {
    const perBlock = ETH / 1000n;
    const r = depositFor(perBlock, 25, 4, 0n, 0n);
    expect(r.deposit).toBe(perBlock * 25n * 4n);
    expect(r.effectiveAmountPerBlock).toBe(perBlock);
    expect(r.feePerRound).toBe(0n);
  });

  it("truncation edges: derived amount never lands below the desired amount", () => {
    // Awkward primes to force integer-division truncation.
    for (const [perBlock, blocks, rounds, bps, flat] of [
      [1_000_003n, 7, 13, 137n, 11n],
      [999_999_999_999_937n, 3, 97, 250n, 123_456_789n],
      [25n * GWEI * 100n + 1n, 24, 100, 100n, 0n],
    ] as const) {
      const r = depositFor(perBlock, blocks, rounds, bps, flat);
      expect(r.effectiveAmountPerBlock).toBeGreaterThanOrEqual(perBlock);
      expect(
        derivedAmountPerBlock(
          r.deposit,
          BigInt(blocks),
          BigInt(rounds),
          bps,
          flat,
        ),
      ).toBe(r.effectiveAmountPerBlock);
    }
  });

  it("feePerRound picks the hybrid max", () => {
    expect(feePerRound(ETH, 25n, 100n, 0n)).toBe((ETH * 25n * 100n) / 10_000n);
    expect(feePerRound(1000n, 2n, 100n, ETH)).toBe(ETH);
  });

  it("derivedAmountPerBlock signals InsufficientDeposit as 0", () => {
    // Deposit smaller than the total flat fees → contract reverts; we get 0.
    expect(derivedAmountPerBlock(10n, 2n, 3n, 0n, 100n)).toBe(0n);
  });
});
