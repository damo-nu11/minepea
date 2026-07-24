/**
 * Pins for the chain reader behind the peapot announcer.
 *
 * The whole approach hangs on one hand-pinned event signature: if the
 * deployed contract's RoundSettled shape ever changes, getLogs returns
 * nothing and the announcer goes silently deaf, with no error anywhere.
 * The topic pin turns that silence into a red test.
 */

import { describe, expect, it } from "vitest";
import { ANNOUNCE_MAX_AGE_MS } from "@/lib/server/peapotAlerts";
import {
  logToHit,
  ROUND_SETTLED_TOPIC,
  SCAN_WINDOW_MS,
} from "@/lib/server/peapotChain";

describe("RoundSettled signature", () => {
  it("hashes to the topic verified against the deployed contract", () => {
    // Computed from the verified ABI on the block explorer and confirmed by
    // decoding round 2667's real hit on-chain (11.9 PEA, tile 14). If this
    // fails, the event signature drifted and the scan is reading nothing.
    expect(ROUND_SETTLED_TOPIC).toBe(
      "0xe6572cd534fc4ba30405faf386eb235e01c8877062954147fad1f880b9fcf74b",
    );
  });
});

describe("scan window", () => {
  it("always exceeds the announce window, so no announceable hit can fall outside the scan", () => {
    expect(SCAN_WINDOW_MS).toBeGreaterThan(ANNOUNCE_MAX_AGE_MS);
  });
});

describe("logToHit", () => {
  const args = {
    roundId: 2667n,
    winningBlock: 13,
    peapotAmount: 11_900_000_000_000_000_000n, // 11.9 PEA in wei
  };
  // Round 2667's real block time, 2026-07-23T21:48:06Z.
  const blockTs = 1_784_929_686n;

  it("reproduces round 2667's real hit exactly", () => {
    const hit = logToHit(args, blockTs);
    expect(hit.roundId).toBe(2667);
    // The contract counts tiles from 0; every user-facing surface from 1.
    // Announcing the raw index names the wrong tile on every single alert.
    expect(hit.tile).toBe(14);
    expect(hit.pea).toBeCloseTo(11.9, 9);
    expect(hit.settledAtMs).toBe(Number(blockTs) * 1000);
  });

  it("covers both tile extremes of the 1-indexing rule", () => {
    expect(logToHit({ ...args, winningBlock: 0 }, blockTs).tile).toBe(1);
    expect(logToHit({ ...args, winningBlock: 24 }, blockTs).tile).toBe(25);
  });

  it("always yields a positive settlement time from a real block", () => {
    // The route treats settledAtMs 0 as too-old-to-announce; a block always
    // has a timestamp, so a chain-sourced hit must never look like that.
    expect(logToHit(args, 1n).settledAtMs).toBeGreaterThan(0);
  });
});

describe("scanPeapotHits against a replayed chain", () => {
  // A fake client replaying the shape of the real chain (head ~18.4M,
  // ~0.11s/block, the genuine round-2667 hit among ordinary settlements).
  // Every RPC call the scan makes was separately proven against the live
  // node; this exercises the window logic, the zero-peapot filter and the
  // per-hit block lookup through the real function.
  const HEAD = 18_400_000n;
  const HEAD_TS = 1_785_000_000n;
  const tsOf = (b: bigint) => HEAD_TS - (HEAD - b) / 9n; // ~9 blocks/s

  // In BLOCK ORDER, oldest first, because that is how a real RPC returns
  // logs. The route re-sorts by roundId before announcing either way.
  const LOGS = [
    // A stale hit near the window edge: still returned; AGE is the route's call.
    {
      args: {
        roundId: 3_600n,
        winningBlock: 0,
        peapotAmount: 1_000_000_000_000_000_000n,
      },
      blockNumber: HEAD - 35_000n,
    },
    // Ordinary settlement, no peapot: must be counted but never a hit.
    {
      args: { roundId: 3_700n, winningBlock: 4, peapotAmount: 0n },
      blockNumber: HEAD - 500n,
    },
    // A fresh hit.
    {
      args: {
        roundId: 3_701n,
        winningBlock: 13,
        peapotAmount: 11_900_000_000_000_000_000n,
      },
      blockNumber: HEAD - 300n,
    },
  ];

  const fake = {
    getBlockNumber: async () => HEAD,
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
      timestamp: tsOf(blockNumber),
    }),
    getLogs: async ({
      fromBlock,
      toBlock,
    }: {
      fromBlock: bigint;
      toBlock: bigint;
    }) =>
      LOGS.filter(
        (l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock,
      ),
  } as never;

  it("returns every hit in the window and none of the zero rounds", async () => {
    const { scanPeapotHits } = await import("@/lib/server/peapotChain");
    const scan = await scanPeapotHits(fake, Number(HEAD_TS) * 1000);
    expect(scan.settledSeen).toBe(3);
    // Hits come back in block order, as the RPC returns them.
    expect(scan.hits.map((h) => h.roundId)).toEqual([3_600, 3_701]);
    const fresh = scan.hits[1];
    expect(fresh.tile).toBe(14);
    expect(fresh.pea).toBeCloseTo(11.9, 9);
    // Timestamps come from the hit's own block, not the head.
    expect(fresh.settledAtMs).toBe(Number(tsOf(HEAD - 300n)) * 1000);
    // And the window actually covers the scan target: fromBlock is old
    // enough that its timestamp precedes now minus the window.
    expect(Number(scan.fromBlock)).toBeLessThan(Number(HEAD - 35_000n));
  });
});
