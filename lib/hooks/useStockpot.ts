"use client";

/**
 * Live Stockpot data hook: composes the ledger route (chain-derived
 * purchases/payouts + chart history, refreshed every 5 minutes) with the
 * direct chain snapshot (Chainlink feed prices + paused flags, one
 * multicall every 60s) into the section's view model.
 *
 * Hook contract (house rule): { data, status }, components handle
 * undefined. A refresh failure KEEPS the data already shown — status only
 * reads "error" when there is nothing to show at all. Both loops are
 * visibility-gated and swallow AbortError-free (fetch failures mark, chain
 * failures mark, neither throws into React).
 *
 * PROGRESSIVE: the ledger is the ONLY gate. Waiting for both sources held
 * the whole tab hostage to the slower fetch (user 2026-07-28); the ledger
 * alone paints holdings, counts and cost basis, and the price snapshot
 * fills the value columns in when it lands (dashes until then, per the
 * mapper's gates).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { readStockpotSnapshot } from "@/lib/stockpot/chain";
import { toStockpotVM } from "@/lib/stockpot/mappers";
import type {
  StockpotLedgerPayload,
  StockpotPendingWire,
  StockpotSnapshotWire,
  StockpotVM,
} from "@/lib/stockpot/types";

/** The backend's live pot feed (dev 2026-07-28); env-overridable, with the
 * production host as the default so local dev reads the real pot too. */
const PENDING_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "https://api.minepea.com"}/api/stockpot/pending`;
const PENDING_MS = 30_000;
/** Consecutive pending failures before falling back to flow-derived. */
const PENDING_MAX_MISSES = 3;

const LEDGER_MS = 300_000;
/** Fast retry cadence while the tab has NOTHING to show yet: a hung or
 * failed first fetch must not strand the section on its loading message
 * for the full refresh interval. */
const LEDGER_BOOTSTRAP_RETRY_MS = 15_000;
const LEDGER_TIMEOUT_MS = 30_000;
const SNAPSHOT_MS = 60_000;

export interface StockpotData {
  vm: StockpotVM;
  history: Record<string, { t: number; v: number }[]>;
  truncated: boolean;
}

export function useStockpot(ethUsd: number): {
  data: StockpotData | null;
  status: "loading" | "live" | "error";
  pricesLive: boolean;
} {
  // The arrival stamp rides WITH the payload (state, not a ref: the memo
  // below reads it during render, where refs are off-limits).
  const [ledger, setLedger] = useState<{
    payload: StockpotLedgerPayload;
    atMs: number;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<StockpotSnapshotWire | null>(null);
  const [pending, setPending] = useState<StockpotPendingWire | null>(null);
  const [failed, setFailed] = useState(false);
  /** Snapshot health, tracked apart from the ledger: a price-read failure
   * must not print the ledger-error message, and vice versa. */
  const [snapshotOk, setSnapshotOk] = useState(true);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let bootstrapRetry: ReturnType<typeof setTimeout> | null = null;
    let hasLedger = false;
    const loadLedger = () => {
      if (document.visibilityState !== "visible") return;
      // Feature-detected: a bare AbortSignal.timeout throws on older
      // engines and would error-boundary the whole page (audit).
      const signal =
        typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(LEDGER_TIMEOUT_MS)
          : undefined;
      void fetch("/api/stockpot/ledger", { signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((body: StockpotLedgerPayload) => {
          if (!alive.current) return;
          hasLedger = true;
          setLedger((prev) => {
            // CDN POPs hold independent cache generations; a request that
            // lands on a colder edge can return an OLDER ledger. Figures
            // must never regress, so keep the larger view.
            if (prev && !body.truncated && !prev.payload.truncated) {
              const incoming = body.purchases.length + body.payouts.length;
              const held =
                prev.payload.purchases.length + prev.payload.payouts.length;
              if (incoming < held) return prev;
            }
            return { payload: body, atMs: Date.now() };
          });
          setFailed(false);
        })
        .catch(() => {
          if (!alive.current) return;
          setFailed(true);
          // Nothing on screen yet: retry soon rather than waiting out the
          // full refresh interval.
          if (!hasLedger) {
            if (bootstrapRetry) clearTimeout(bootstrapRetry);
            bootstrapRetry = setTimeout(loadLedger, LEDGER_BOOTSTRAP_RETRY_MS);
          }
        });
    };
    const loadSnapshot = () => {
      if (document.visibilityState !== "visible") return;
      void readStockpotSnapshot()
        .then((snap) => {
          if (!alive.current) return;
          setSnapshot(snap);
          setSnapshotOk(true);
        })
        .catch(() => {
          if (alive.current) setSnapshotOk(false);
        });
    };
    // The backend's live pot feed. Defensive parse; repeated failures null
    // it out so THE POT falls back to the flow-derived value instead of
    // freezing on a dead feed's last number.
    let pendingMisses = 0;
    const loadPending = () => {
      if (document.visibilityState !== "visible") return;
      void fetch(PENDING_URL)
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then(
          (body: {
            marketOpen?: boolean;
            pendingEth?: { totalWei?: string };
            pendingStocks?: { address?: string; amountWei?: string }[];
            updatedAt?: number;
            stale?: boolean;
          }) => {
            if (!alive.current) return;
            pendingMisses = 0;
            setPending({
              marketOpen: body.marketOpen === true,
              pendingEthWei: body.pendingEth?.totalWei ?? "0",
              pendingStocks: (body.pendingStocks ?? []).flatMap((s) =>
                s.address && s.amountWei
                  ? [{ address: s.address, amountWei: s.amountWei }]
                  : [],
              ),
              updatedAtMs: Number(body.updatedAt) || Date.now(),
              stale: body.stale === true,
            });
          },
        )
        .catch(() => {
          if (!alive.current) return;
          pendingMisses += 1;
          if (pendingMisses >= PENDING_MAX_MISSES) setPending(null);
        });
    };
    loadLedger();
    loadSnapshot();
    loadPending();
    const t1 = setInterval(loadLedger, LEDGER_MS);
    const t2 = setInterval(loadSnapshot, SNAPSHOT_MS);
    const t3 = setInterval(loadPending, PENDING_MS);
    // A tab opened in the BACKGROUND skips its initial loads (all loaders
    // gate on visibility) — without this, it stalls on the loading message
    // until the next interval after focus, up to the full refresh window.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!hasLedger) loadLedger();
      loadSnapshot();
      loadPending();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
      if (bootstrapRetry) clearTimeout(bootstrapRetry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const data = useMemo<StockpotData | null>(() => {
    if (!ledger) return null;
    const snap = snapshot ?? { asOfMs: ledger.atMs, prices: [] };
    return {
      vm: toStockpotVM(
        {
          // Stamps must never claim more freshness than the OLDER source:
          // holdings/counts are ledger-derived even when prices are newer.
          // (The pending feed's own 30s cadence is its freshness story.)
          snapshot: { ...snap, asOfMs: Math.min(snap.asOfMs, ledger.atMs) },
          purchases: ledger.payload.purchases,
          payouts: ledger.payload.payouts,
        },
        pending ? { pending, ethUsd } : undefined,
      ),
      history: ledger.payload.history,
      truncated: ledger.payload.truncated,
    };
  }, [ledger, snapshot, pending, ethUsd]);

  return {
    data,
    status: data ? "live" : failed ? "error" : "loading",
    /** False while the price snapshot is absent or its last read failed —
     * the tab says so instead of leaving dashes unexplained. */
    pricesLive: snapshot !== null && snapshotOk,
  };
}
