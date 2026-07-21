"use client";

/**
 * Wallet stub (Phase 1) — ships the FINAL component-facing API; Privy replaces
 * the internals in Phase 9 (see the project docs Data Layer).
 *
 * Deliberately async everywhere so components exercise real states now:
 * - ~300ms fake init  → 'initializing' is a real, visible state
 * - connect() resolves after a delay and is rejectable (a real modal can be
 *   dismissed) — here it always succeeds
 * - balances are NOT a sync field on the wallet: Privy doesn't provide them,
 *   so they load through a separate async path with their own status
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  WalletContext,
  useBalances,
  useWallet,
  type WalletContextValue,
} from "@/lib/walletContext";
import { fmtToken, fromWei } from "@/lib/format";
import type {
  Address,
  BalancesVM,
  BalancesWire,
  HookResult,
  WalletStatus,
} from "@/lib/types";

const INIT_DELAY_MS = 300;
const CONNECT_DELAY_MS = 600;
const BALANCE_FETCH_DELAY_MS = 400;

/** Fixed mock identity until Privy lands. */
const MOCK_ADDRESS: Address = "0xA11cE00000000000000000000000000000009EA0";
const MOCK_BALANCES: BalancesWire = {
  ethWei: "2451700000000000000", // 2.4517 ETH
  peaWei: "1250000000000000000000", // 1,250 PEA
};

function toBalancesVM(wire: BalancesWire): BalancesVM {
  const eth = fromWei(wire.ethWei);
  const pea = fromWei(wire.peaWei);
  return {
    eth,
    ethFormatted: fmtToken(eth, 4),
    pea,
    peaFormatted: fmtToken(pea, 2),
  };
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("initializing");
  const [address, setAddress] = useState<Address | null>(null);
  const [balances, setBalances] = useState<HookResult<BalancesVM>>({
    data: undefined,
    status: "loading",
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  /** Cancel every in-flight session timer (connect delay, balance fetch). */
  const clearPending = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setStatus("disconnected"), INIT_DELAY_MS);
    return () => {
      clearTimeout(t);
      clearPending();
    };
  }, [clearPending]);

  const connect = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      clearPending(); // a fresh connect supersedes any stale session timers
      setStatus("connecting");
      later(() => {
        setAddress(MOCK_ADDRESS);
        setStatus("connected");
        // Balance fetch is its own async path with its own loading state.
        setBalances({ data: undefined, status: "loading" });
        later(() => {
          setBalances({ data: toBalancesVM(MOCK_BALANCES), status: "live" });
        }, BALANCE_FETCH_DELAY_MS);
        resolve();
      }, CONNECT_DELAY_MS);
    });
  }, [later, clearPending]);

  const disconnect = useCallback(() => {
    // Cancel the in-flight balance fetch so balances can't go 'live' after
    // disconnecting (audit finding).
    clearPending();
    setAddress(null);
    setStatus("disconnected");
    setBalances({ data: undefined, status: "loading" });
  }, [clearPending]);

  // Same seam as the real provider: re-land the (static) mock values after
  // the fetch delay. Previous data stays visible while the refresh runs.
  const refreshBalances = useCallback(() => {
    if (status !== "connected") return;
    later(() => {
      setBalances({ data: toBalancesVM(MOCK_BALANCES), status: "live" });
    }, BALANCE_FETCH_DELAY_MS);
  }, [status, later]);

  const value = useMemo<WalletContextValue>(
    () => ({ status, address, connect, disconnect, balances, refreshBalances }),
    [status, address, connect, disconnect, balances, refreshBalances],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

// Re-exported so existing `from "@/lib/wallet"` imports keep working.
export { useBalances, useWallet };
