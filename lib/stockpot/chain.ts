/**
 * Live Stockpot snapshot: one Multicall3 batch over the failover RPC
 * transport reads every asset's Chainlink feed answer and oraclePaused
 * flag. Ten eth_calls become ONE rpc request, and the failover transport
 * (lib/contracts.ts) covers the users whose networks dislike the official
 * host — the same resilience story as wallet balance reads.
 *
 * The feed price is already dividend-multiplier-adjusted (per-token, not
 * per-original-share), so value = token units × feed price with no extra
 * math. uiMultiplier() is deliberately NOT read yet: every multiplier is
 * 1.0 today, and displaying units×multiplier as "shares" while pricing
 * per-token would make shares × shown-price disagree with value. Revisit
 * when the first real dividend moves a multiplier off 1.0.
 *
 * allowFailure: a single paused or reverting feed must not kill the batch;
 * its asset renders dashes (the mapper's paused/no-price gates).
 */

import { createPublicClient } from "viem";
import { CHAIN, chainReadTransport } from "@/lib/contracts";
import { STOCKPOT_ASSETS } from "@/lib/stockpot/registry";
import type { StockpotSnapshotWire } from "@/lib/stockpot/types";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const AGGREGATOR_ABI = [
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const STOCK_TOKEN_ABI = [
  {
    name: "oraclePaused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export async function readStockpotSnapshot(): Promise<StockpotSnapshotWire> {
  const client = createPublicClient({
    chain: CHAIN,
    transport: chainReadTransport(),
  });
  const results = await client.multicall({
    multicallAddress: MULTICALL3,
    contracts: STOCKPOT_ASSETS.flatMap((a) => [
      {
        address: a.feed,
        abi: AGGREGATOR_ABI,
        functionName: "latestRoundData",
      } as const,
      {
        address: a.token,
        abi: STOCK_TOKEN_ABI,
        functionName: "oraclePaused",
      } as const,
    ]),
  });

  const nowMs = Date.now();
  return {
    asOfMs: nowMs,
    prices: STOCKPOT_ASSETS.map((a, i) => {
      const feed = results[i * 2];
      const pausedRead = results[i * 2 + 1];
      const data =
        feed.status === "success"
          ? (feed.result as readonly [bigint, bigint, bigint, bigint, bigint])
          : null;
      const answer = data ? data[1] : null;
      // Staleness gate (audit 2026-07-28): a feed that stops updating keeps
      // answering with its last price and oraclePaused stays false (pause is
      // a token-level corporate-action flag, not feed health), so without
      // this a dead feed prints a confident frozen price forever. Heartbeat
      // is 24h; 26h adds slack.
      const updatedAtMs = data ? Number(data[3]) * 1000 : 0;
      const fresh = updatedAtMs > 0 && nowMs - updatedAtMs < 26 * 3_600_000;
      return {
        token: a.token,
        // Failed, non-positive or STALE reads price as "0"; the mapper
        // treats any non-positive price as unknown (dash), independent of
        // the paused flag.
        priceUsd8:
          answer !== null && answer > 0n && fresh ? answer.toString() : "0",
        paused:
          pausedRead.status === "success"
            ? (pausedRead.result as boolean)
            : true,
      };
    }),
  };
}
