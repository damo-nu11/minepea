/**
 * Per-miner round rewards, against the REAL captured /api/round/311/miners
 * payload (captured 2026-07-20). Round 311 is the regression case: a SPLIT
 * round that dropped a 6 PEA peapot, where the old client-side reconstruction
 * showed the two winners sharing 1 PEA instead of 1 + 6.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Verbatim backend response — do not "tidy" the values. */
const ROUND_311 = {
  roundId: 311,
  winningBlock: 19,
  miners: [
    {
      address: "0x2777130b3800bf2c0bcd1717b456c2cb3810149b",
      ethRewardFormatted: "0.000054091132186874",
      peaReward: "3543242528276595183",
      peaRewardFormatted: "3.543242528276595183",
      deployedFormatted: "0.000002563783333333",
    },
    {
      address: "0x11e0da2edb024fcc482fb7db4b7d95fb798f1b83",
      ethRewardFormatted: "0.000052770851514897",
      peaReward: "3456757471723404815",
      peaRewardFormatted: "3.456757471723404815",
      deployedFormatted: "0.000002501205357142",
    },
  ],
};

const A = ROUND_311.miners[0].address;
const B = ROUND_311.miners[1].address;

async function loadHook() {
  const mod = await import("./roundMiners");
  return mod.useRoundMinerRewards;
}

function stubFetch(body: unknown, ok = true) {
  const fn = vi.fn(async () => ({ ok, json: async () => body }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.resetModules();
  // The module reads the API base at import time — stub BEFORE loading it.
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("useRoundMinerRewards", () => {
  it("folds the PEAPOT into every winner's reward (round 311 regression)", async () => {
    stubFetch(ROUND_311);
    const useRoundMinerRewards = await loadHook();
    const { result } = renderHook(() => useRoundMinerRewards(311));

    await waitFor(() => expect(result.current).not.toBeNull());
    const rewards = result.current!;

    expect(rewards.get(A)).toBeCloseTo(3.5432, 4);
    expect(rewards.get(B)).toBeCloseTo(3.4568, 4);

    // The whole point of the fix: 1.0 base emission + the 6.0 peapot. The
    // reconstruction this replaced summed to 1.0 and hid the peapot entirely.
    const total = [...rewards.values()].reduce((sum, v) => sum + v, 0);
    expect(total).toBeCloseTo(7, 6);
  });

  it("hits the round's miners endpoint exactly once", async () => {
    const fetchFn = stubFetch(ROUND_311);
    const useRoundMinerRewards = await loadHook();
    renderHook(() => useRoundMinerRewards(311));

    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.test/api/round/311/miners",
    );
  });

  it("gives a SOLO round's whole emission to the one winner (round 534)", async () => {
    // Real /api/round/534/miners: isSplit=false, three miners covered the
    // winning tile, but only the seed-resolved peaWinner is paid. The other
    // two come back as explicit 0.0 rows — they must NOT be crowned.
    stubFetch({
      roundId: 534,
      winningBlock: 0,
      miners: [
        { address: "0x701c61aaf2ac2b1f8b7f3f8b0a2f1c9d3e4b5a6c", peaRewardFormatted: "1.0" },
        { address: "0x440903f93a4b6c8d2e1f0a9b8c7d6e5f4a3b2c1d", peaRewardFormatted: "0.0" },
        { address: "0xe8d9bda4c9f1e2d3c4b5a6978869504132231445", peaRewardFormatted: "0.0" },
      ],
    });
    const useRoundMinerRewards = await loadHook();
    const { result } = renderHook(() => useRoundMinerRewards(534));

    await waitFor(() => expect(result.current).not.toBeNull());
    const rewards = result.current!;

    expect(rewards.get("0x701c61aaf2ac2b1f8b7f3f8b0a2f1c9d3e4b5a6c")).toBe(1);
    // Zero-reward winners must be absent, so the panel renders them plain:
    // no reward badge, no gradient "crowned" name.
    expect(rewards.get("0x440903f93a4b6c8d2e1f0a9b8c7d6e5f4a3b2c1d")).toBeUndefined();
    expect(rewards.get("0xe8d9bda4c9f1e2d3c4b5a6978869504132231445")).toBeUndefined();
    expect(rewards.size).toBe(1);
  });

  it("omits non-winners, so callers read 'missing' as won-nothing", async () => {
    stubFetch(ROUND_311);
    const useRoundMinerRewards = await loadHook();
    const { result } = renderHook(() => useRoundMinerRewards(311));

    await waitFor(() => expect(result.current).not.toBeNull());
    // A third wallet deployed in round 311 but missed the winning tile.
    expect(
      result.current!.get("0xd561ed2d812d8a58fa2b9cf9659ece46a91e5e44"),
    ).toBeUndefined();
    expect(result.current!.size).toBe(2);
  });

  it("never paints one round's rewards onto another", async () => {
    stubFetch(ROUND_311);
    const useRoundMinerRewards = await loadHook();
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useRoundMinerRewards(id),
      { initialProps: { id: 311 } },
    );
    await waitFor(() => expect(result.current).not.toBeNull());

    // Asking about a different round must not keep serving 311's answer.
    rerender({ id: 312 });
    expect(result.current).toBeNull();
  });

  it("stays null when there is no round to ask about", async () => {
    const fetchFn = stubFetch(ROUND_311);
    const useRoundMinerRewards = await loadHook();
    const { result } = renderHook(() => useRoundMinerRewards(undefined));

    expect(result.current).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("degrades to null on a failed request rather than a wrong number", async () => {
    stubFetch({}, false);
    const useRoundMinerRewards = await loadHook();
    const { result } = renderHook(() => useRoundMinerRewards(311));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
