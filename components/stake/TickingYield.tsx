"use client";

/**
 * Live-ticking pending yield (leaf, Convention 4: only the digits re-render).
 *
 * Truth comes from two places: the position the provider already fetched
 * (prop), and a light direct read of the staking contract's
 * getPendingRewards every POLL_MS — a CHAIN call through the failover
 * transport, so it costs the backend's strict pool nothing and inherits the
 * multi-host resilience. Between truths the value grows at a conservative
 * estimated rate and SNAPS to every real reading (lib/yieldTicker.ts owns
 * that math and its honesty rules).
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
  tickedValue,
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
  const prevTruth = useRef<{ value: number; atMs: number } | null>(null);

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
    const truth = { value, atMs: Date.now() };
    setAnchor(
      anchorFromTruth(
        prevTruth.current,
        truth,
        rateInputs.current.stakedPea,
        rateInputs.current.aprPct,
      ),
    );
    prevTruth.current = truth;
    setNowMs(truth.atMs);
  }, []);

  // Provider truth: every position update (fetch, SSE, claim/compound zeroing)
  // re-anchors. A DOWNWARD move (claim) snaps instantly by construction.
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
