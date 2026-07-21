"use client";

/**
 * Per-miner round rewards from the backend's GET /api/round/:id/miners —
 * the authoritative answer to "what did this wallet win in this round".
 *
 * Why this exists (live bug 2026-07-20): MinersFeed used to RECONSTRUCT the
 * split client-side from the round's deploy events, which silently dropped
 * the PEAPOT — a 6 PEA peapot round showed the winners sharing 1 PEA. The
 * server already computes the real thing (same formula as GridMining's
 * checkpoint): base emission pro-rata for a split, whole to the seed-resolved
 * winner for a solo round, PLUS the peapot pro-rata across every winning-tile
 * miner. It also uses the true `winnersDeployed` as the denominator rather
 * than whatever subset of miners a client happens to have seen.
 *
 * Only winning-tile miners appear in the response — an address that is absent
 * won nothing, which is why callers treat "missing" as 0.
 */

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface MinerRewardRow {
  address: string;
  /** Decimal PEA string (ethers.formatEther) — peapot already folded in. */
  peaRewardFormatted?: string;
}

interface RoundMinersResponse {
  roundId: number;
  winningBlock: number;
  miners?: MinerRewardRow[];
}

/**
 * Lowercased address → PEA won in `roundId`.
 *
 * Returns null while the answer is not known — mock mode, no round yet, the
 * fetch in flight, or a failed request — so callers can distinguish "not
 * known yet" from "won nothing" and avoid rendering a wrong number.
 */
export function useRoundMinerRewards(
  roundId: number | undefined,
): Map<string, number> | null {
  // Keyed result: a response only counts while it matches the round being
  // asked about, so a slow fetch can never paint the wrong round's rewards.
  const [state, setState] = useState<{
    roundId: number;
    rewards: Map<string, number>;
  } | null>(null);

  useEffect(() => {
    if (!API_URL || roundId === undefined) return;
    let cancelled = false;
    fetch(`${API_URL}/api/round/${roundId}/miners`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((body: RoundMinersResponse) => {
        if (cancelled) return;
        const rewards = new Map<string, number>();
        for (const m of body.miners ?? []) {
          const pea = Number(m.peaRewardFormatted ?? 0);
          if (Number.isFinite(pea) && pea > 0)
            rewards.set(m.address.toLowerCase(), pea);
        }
        setState({ roundId, rewards });
      })
      .catch(() => {
        // Settled rounds are immutable, so a miss just means "unknown" —
        // rows render without a reward badge rather than a wrong one.
      });
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  return state && state.roundId === roundId ? state.rewards : null;
}
