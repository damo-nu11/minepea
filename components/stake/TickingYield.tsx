"use client";

/**
 * Live-ticking pending yield (leaf, Convention 4: only the digits re-render).
 *
 * Truth comes from two places: the position the provider already fetched
 * (prop), and a light direct read of the staking contract's
 * getPendingRewards every POLL_MS — a CHAIN call through the failover
 * transport, so it costs the backend's strict pool nothing and inherits the
 * multi-host resilience. Between truths the value grows at a conservative
 * estimated rate and SNAPS to every accepted reading (lib/yieldTicker.ts
 * owns that math and its honesty rules). The rate is measured across a
 * rolling WINDOW of readings, never a consecutive pair — the chain value
 * steps once per distribution, so pairs inside a flat step froze the
 * display (user 2026-07-26 evening). Small downward readings are stale
 * news from the slower source and are ignored; only a claim-sized drop
 * (below CLAIM_DROP_FACTOR of the last reading) resets the display.
 *
 * Six decimals: enough for a 1-PEA staker to see movement within seconds
 * without the number reading as noise. Full precision rides on the title.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPublicClient } from "viem";
import { stakingAbi } from "@/lib/abi/staking";
import { chainReadTransport, CHAIN, CONTRACTS } from "@/lib/contracts";
import { fromWei } from "@/lib/format";
import type { Address } from "@/lib/types";
import {
  anchorFromTruth,
  CLAIM_DROP_FACTOR,
  observedRate,
  pruneTruths,
  tickedValue,
  type TruthReading,
  type YieldAnchor,
} from "@/lib/yieldTicker";

/** Chain truth cadence. Light: one eth_call per open Stake page. */
const POLL_MS = 25_000;
/** Display cadence; slowed under prefers-reduced-motion. */
const TICK_MS = 250;
const TICK_MS_REDUCED = 1_000;

export function TickingYield({
  pendingYield,
  stakedPea,
  aprPct,
  address,
  pollChain,
}: {
  /** Latest pending yield from the provider, or undefined while unknown. */
  pendingYield: number | undefined;
  stakedPea: number;
  aprPct: number | null;
  address: Address | null;
  /** Chain polling is API-mode only; the sim has no contract to ask. */
  pollChain: boolean;
}) {
  const [anchor, setAnchor] = useState<YieldAnchor | null>(null);
  const [nowMs, setNowMs] = useState(0);
  /** Rolling window of accepted readings; the rate is measured across it. */
  const truthsRef = useRef<TruthReading[]>([]);

  // Rate inputs live in a ref (synced in an effect, never during render) so
  // a truth arriving mid-poll uses the freshest stake/APR without re-arming
  // any timer.
  const rateInputs = useRef({ stakedPea, aprPct: aprPct ?? 0 });
  useEffect(() => {
    rateInputs.current = { stakedPea, aprPct: aprPct ?? 0 };
  }, [stakedPea, aprPct]);

  // Stable identity: reads only refs and setters, so the consuming effects
  // can list it as a dep without re-running on every render.
  const applyTruth = useCallback((value: number) => {
    const atMs = Date.now();
    const truths = truthsRef.current;
    const prev = truths[truths.length - 1];
    if (prev && value < prev.value) {
      if (value < prev.value * CLAIM_DROP_FACTOR) {
        // A claim/compound zeroed the bucket: snap down NOW, fresh window.
        truthsRef.current = [{ value, atMs }];
      } else {
        // Stale reading from the slower source. Accrual is monotone, so a
        // small dip is old news and must not dent a climbing display.
        return;
      }
    } else {
      truthsRef.current = pruneTruths([...truths, { value, atMs }], atMs);
    }
    setAnchor(
      anchorFromTruth(
        observedRate(truthsRef.current),
        { value, atMs },
        rateInputs.current.stakedPea,
        rateInputs.current.aprPct,
      ),
    );
    setNowMs(atMs);
  }, []);

  // Provider truth: every position update (fetch, SSE, claim/compound
  // zeroing) feeds the window. A claim-sized drop snaps instantly; a small
  // stale dip is ignored inside applyTruth.
  useEffect(() => {
    if (pendingYield === undefined) return;
    applyTruth(pendingYield);
  }, [pendingYield, applyTruth]);

  // Chain truth: the contract's own number, address-guarded against switches.
  useEffect(() => {
    if (!pollChain || !address) return;
    let cancelled = false;
    const client = createPublicClient({
      chain: CHAIN,
      transport: chainReadTransport(),
    });
    const read = () => {
      if (document.visibilityState !== "visible") return;
      void client
        .readContract({
          address: CONTRACTS.staking,
          abi: stakingAbi,
          functionName: "getPendingRewards",
          args: [address],
        })
        .then((wei) => {
          if (!cancelled) applyTruth(fromWei((wei as bigint).toString()));
        })
        .catch(() => {
          // Chain read is an enhancement; provider truth still anchors.
        });
    };
    const t = setInterval(read, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pollChain, address, applyTruth]);

  // The tick itself. Closed-form from wall clock, so hidden tabs catch up.
  useEffect(() => {
    if (!anchor || anchor.ratePerSec <= 0) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setInterval(
      () => setNowMs(Date.now()),
      reduced ? TICK_MS_REDUCED : TICK_MS,
    );
    return () => clearInterval(t);
  }, [anchor]);

  if (pendingYield === undefined && !anchor) return <>—</>;
  const value = anchor ? tickedValue(anchor, nowMs) : (pendingYield ?? 0);
  return (
    <span className="tnum" title={`${value} PEA (live estimate)`}>
      {/* Fixed 6dp, deliberately NOT the trimming formatter: a ticker's tail
          digits must hold their columns or the motion reads as jitter. */}
      {value.toFixed(6)}
    </span>
  );
}
