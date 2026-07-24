/**
 * SERVER-ONLY: peapot hits read straight from the chain.
 *
 * The announcer used to ask the game API which rounds fired. That call worked
 * from every browser and failed from every server, because the API's edge
 * challenges datacenter traffic and a server cannot answer a challenge. The
 * chain has no such door: `RoundSettled` carries `peapotAmount`, so reading
 * logs over RPC gives the same answer with no edge in the path at all. The
 * equivalent announcer on the team's other protocol has run this way from day
 * one, which is why it never hit the problem.
 *
 * The cost of the approach is a hand-pinned event signature: if the contract
 * ever redeploys with a different `RoundSettled` shape, this module goes
 * silently deaf. That risk is accepted deliberately and made loud instead of
 * silent: the topic hash is pinned in peapotChain.test.ts against the value
 * verified on the deployed contract, and the signature was confirmed by
 * decoding round 2667's real hit (11.9 PEA, tile 14) whose block timestamp
 * matched the API's settledAt to the second (2026-07-23T21:48:06Z).
 */

import {
  createPublicClient,
  http,
  parseAbiItem,
  toEventSelector,
  type PublicClient,
} from "viem";
import { CONTRACTS, RPC_URL } from "@/lib/contracts";
import { fromWei } from "@/lib/format";
import { ANNOUNCE_MAX_AGE_MS, type PeapotHit } from "@/lib/server/peapotAlerts";

export const ROUND_SETTLED = parseAbiItem(
  "event RoundSettled(uint64 indexed roundId, uint8 winningBlock, address topMiner, uint256 totalWinnings, uint256 topMinerReward, uint256 peapotAmount, bool isSplit, uint256 topMinerSeed, uint256 winnersDeployed)",
);

/** Pinned in tests. If this changes, the contract changed under us. */
export const ROUND_SETTLED_TOPIC = toEventSelector(ROUND_SETTLED);

/**
 * How far back each run looks. Must comfortably exceed the announce window:
 * every hit that could still be posted is then guaranteed to be inside the
 * scan, so the announcer needs no cursor and no state. Anything older would
 * be claimed silently anyway, and a hit the scanner never sees simply never
 * posts, which is the same outcome with less bookkeeping.
 */
export const SCAN_WINDOW_MS = ANNOUNCE_MAX_AGE_MS + 15 * 60 * 1000;

/** Decoded log fields this module actually reads. */
export interface RoundSettledArgs {
  roundId: bigint;
  winningBlock: number;
  peapotAmount: bigint;
}

/**
 * One decoded log plus its block time, as a PeapotHit.
 *
 * The tile is 1-indexed for humans (the contract counts from 0), the amount
 * leaves wei here, and the block timestamp (seconds) becomes epoch ms, which
 * is what the route's age gate compares against.
 */
export function logToHit(
  args: RoundSettledArgs,
  blockTsSec: bigint,
): PeapotHit {
  return {
    roundId: Number(args.roundId),
    pea: fromWei(args.peapotAmount.toString()),
    tile: args.winningBlock + 1,
    settledAtMs: Number(blockTsSec) * 1000,
  };
}

export interface ChainScan {
  hits: PeapotHit[];
  /** RoundSettled events seen in the window, hits or not. */
  settledSeen: number;
  fromBlock: string;
  headBlock: string;
}

function defaultClient(): PublicClient {
  return createPublicClient({
    transport: http(RPC_URL, { retryCount: 2, timeout: 15_000 }),
  });
}

/**
 * Find the block that starts the scan window.
 *
 * The chain mints blocks on demand, so the rate swings and a fixed block
 * count is either wasteful or, worse, too short. Start from a generous guess
 * and keep doubling until the block at the candidate start is OLDER than the
 * window's edge, which proves the window is fully covered. Overshooting only
 * costs the RPC a wider (still topic-filtered) scan.
 */
async function startBlockFor(
  client: PublicClient,
  head: bigint,
  nowMs: number,
): Promise<bigint> {
  const targetSec = BigInt(Math.floor((nowMs - SCAN_WINDOW_MS) / 1000));
  // ~9 blocks/s observed; 120k covers the 75-minute window three times over.
  let span = 120_000n;
  for (let i = 0; i < 6; i++) {
    const candidate = head > span ? head - span : 1n;
    const block = await client.getBlock({ blockNumber: candidate });
    if (block.timestamp <= targetSec || candidate === 1n) return candidate;
    span *= 2n;
  }
  return head > span ? head - span : 1n;
}

/** Scan the window for settlement events and return the peapot hits. */
export async function scanPeapotHits(
  client: PublicClient = defaultClient(),
  nowMs: number = Date.now(),
): Promise<ChainScan> {
  const head = await client.getBlockNumber();
  const fromBlock = await startBlockFor(client, head, nowMs);
  const logs = await client.getLogs({
    address: CONTRACTS.gridMining,
    event: ROUND_SETTLED,
    fromBlock,
    toBlock: head,
  });
  const hits: PeapotHit[] = [];
  for (const log of logs) {
    const args = log.args as unknown as RoundSettledArgs;
    if ((args.peapotAmount ?? 0n) === 0n) continue;
    // One extra read per HIT only (about one per five hours), for the block
    // timestamp the age gate needs.
    const block = await client.getBlock({ blockNumber: log.blockNumber });
    hits.push(logToHit(args, block.timestamp));
  }
  return {
    hits,
    settledSeen: logs.length,
    fromBlock: fromBlock.toString(),
    headBlock: head.toString(),
  };
}
