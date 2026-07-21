"use client";

/**
 * Privy wallet provider (Phase 9) — active only when NEXT_PUBLIC_PRIVY_APP_ID
 * is set (see lib/providers.tsx); the stub in lib/wallet.tsx remains the
 * default so the local build never needs credentials.
 *
 * Provides the SAME WalletContext as the stub:
 * - status ladder: initializing (Privy !ready) → disconnected → connecting
 *   (login modal open) → connected
 * - connect() is async + rejectable (modal dismissal rejects)
 * - balances load separately via viem RPC (Privy does not provide balances):
 *   native ETH + PEA ERC-20 balanceOf, chain/RPC/token from lib/contracts.ts.
 *
 * NOT yet runtime-verified — requires a real Privy app id (user credential).
 * Type-checked and build-verified only; flagged in the project docs Phase 9 notes.
 */

import {
  PrivyProvider,
  useLinkAccount,
  useLogin,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, erc20Abi, http, type EIP1193Provider } from "viem";
import { CHAIN, CONTRACTS, RPC_URL } from "@/lib/contracts";
import { fmtToken, fromWei } from "@/lib/format";
import type {
  Address,
  BalancesVM,
  HookResult,
  WalletStatus,
} from "@/lib/types";
import { WalletContext, type WalletContextValue } from "@/lib/walletContext";

function toBalancesVM(ethWei: bigint, peaWei: bigint): BalancesVM {
  const eth = fromWei(ethWei.toString());
  const pea = fromWei(peaWei.toString());
  return {
    eth,
    ethFormatted: fmtToken(eth, 4),
    pea,
    peaFormatted: fmtToken(pea, 2),
  };
}

function Bridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, logout, getAccessToken, unlinkDiscord } =
    usePrivy();
  const [connecting, setConnecting] = useState(false);
  const pending = useRef<{
    resolve(): void;
    reject(e: Error): void;
  } | null>(null);

  const { login } = useLogin({
    onComplete: () => {
      setConnecting(false);
      pending.current?.resolve();
      pending.current = null;
    },
    onError: (error) => {
      setConnecting(false);
      pending.current?.reject(new Error(String(error)));
      pending.current = null;
    },
  });

  const address = (user?.wallet?.address ?? null) as Address | null;

  // A restored Privy session is `authenticated` immediately, but the actual
  // SIGNER (injected/embedded wallet in useWallets) announces itself later —
  // or never, if the wallet dropped the site. Reporting "connected" without
  // a signer made deploys fail with "no wallet" under a connected-looking UI
  // (live bug 2026-07-17): connected now requires the signer to be present.
  const { wallets } = useWallets();
  const signerReady =
    !!address &&
    wallets.some((w) => w.address.toLowerCase() === address.toLowerCase());

  const status: WalletStatus = !ready
    ? "initializing"
    : connecting
      ? "connecting"
      : authenticated && address && signerReady
        ? "connected"
        : "disconnected";

  // login() refuses whenever Privy still considers the session authenticated
  // ("Attempted to log in, but user is already logged in") — and useLogin's
  // login CAPTURES that auth state at render time, so calling it in the same
  // tick that logout() resolves still sees the stale session and aborts (live
  // bug 2026-07-18: switching accounts in the wallet extension drops
  // signerReady — UI shows disconnected — while the Privy session stays
  // authenticated; Connect then errored and wedged). connect() therefore only
  // STARTS the teardown; the effect below fires login() once `authenticated`
  // has actually flipped false, from a render whose login is fresh.
  const wantLogin = useRef(false);

  const connect = useCallback((): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject };
      setConnecting(true);
      if (!authenticated) {
        login();
        return;
      }
      wantLogin.current = true;
      logout().catch((e) => {
        wantLogin.current = false;
        setConnecting(false);
        pending.current?.reject(e instanceof Error ? e : new Error(String(e)));
        pending.current = null;
      });
    });
  }, [login, logout, authenticated]);

  useEffect(() => {
    if (!wantLogin.current || !ready || authenticated) return;
    wantLogin.current = false;
    login();
  }, [ready, authenticated, login]);

  const disconnect = useCallback(() => {
    void logout();
  }, [logout]);

  // ── Balances: separate async path over viem RPC. The exposed value is
  // DERIVED (no state reset in the effect): a fetch result only counts while
  // it matches the currently connected address.
  const [fetched, setFetched] = useState<{
    addr: Address;
    result: HookResult<BalancesVM>;
  } | null>(null);
  // Bumping the tick re-runs the fetch effect; previous data stays visible
  // while the new read is in flight (no state reset in the effect).
  const [balancesTick, setBalancesTick] = useState(0);
  const refreshBalances = useCallback(() => setBalancesTick((t) => t + 1), []);

  useEffect(() => {
    if (status !== "connected" || !address) return;
    let cancelled = false;
    const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
    (async () => {
      try {
        const [ethWei, peaWei] = await Promise.all([
          client.getBalance({ address }),
          client.readContract({
            address: CONTRACTS.peaToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }),
        ]);
        if (!cancelled)
          setFetched({
            addr: address,
            result: { data: toBalancesVM(ethWei, peaWei), status: "live" },
          });
      } catch {
        if (!cancelled)
          setFetched({
            addr: address,
            result: { data: undefined, status: "error" },
          });
      }
    })();
    return () => {
      cancelled = true;
    };
    // balancesTick: deliberate extra dep — refreshBalances() re-reads.
  }, [status, address, balancesTick]);

  const balances: HookResult<BalancesVM> = useMemo(
    () =>
      status === "connected" && address && fetched?.addr === address
        ? fetched.result
        : { data: undefined, status: "loading" },
    [status, address, fetched],
  );

  // ── Discord: Privy-native account linking. Works the moment Discord is
  // enabled in the Privy dashboard (Login Methods → Socials) — no custom
  // backend. Failures surface through the seam (audit: silent no-op when
  // the dashboard hasn't enabled Discord yet).
  const [discordError, setDiscordError] = useState<string | null>(null);
  const { linkDiscord } = useLinkAccount({
    onSuccess: () => setDiscordError(null),
    onError: () =>
      setDiscordError("Discord linking is unavailable right now."),
  });
  const discord = useMemo(
    () => ({
      username: user?.discord?.username ?? null,
      link: () => {
        setDiscordError(null);
        // linkDiscord is typed void but returns a promise at runtime; the
        // "provider not enabled" failure REJECTS it (bypassing onError —
        // audit, verified against the SDK bundle). Catch both paths.
        void Promise.resolve(
          linkDiscord() as unknown as Promise<void> | undefined,
        ).catch(() =>
          setDiscordError("Discord linking is unavailable right now."),
        );
      },
      unlink: async () => {
        const subject = user?.discord?.subject;
        if (subject) await unlinkDiscord(subject);
      },
      error: discordError,
    }),
    [user?.discord?.username, user?.discord?.subject, linkDiscord, unlinkDiscord, discordError],
  );

  // ── Tx-signing seam: the connected wallet's EIP-1193 provider (embedded
  // or injected), resolved lazily per tx so wallet switches are picked up.
  const getEthereumProvider = useCallback(async () => {
    const target = wallets.find(
      (w) => w.address.toLowerCase() === address?.toLowerCase(),
    );
    if (!target) throw new Error("No connected wallet to sign with");
    // Privy's EIP-1193 typing differs nominally from viem's (event-handler
    // generics); the runtime object is spec-compliant and viem's custom()
    // transport only needs `request`.
    return (await target.getEthereumProvider()) as unknown as EIP1193Provider;
  }, [wallets, address]);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      address,
      connect,
      disconnect,
      balances,
      refreshBalances,
      discord,
      getEthereumProvider,
      getAccessToken,
    }),
    [status, address, connect, disconnect, balances, refreshBalances, discord, getEthereumProvider, getAccessToken],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function PrivyWalletProvider({
  appId,
  children,
}: {
  appId: string;
  children: React.ReactNode;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Voltage-themed modal: near-black ground (surface token), lime
        // accent, centered PEA wordmark as the sole header (landingHeader
        // blanked — the SDK only falls back to its default text on
        // null/undefined, so "" leaves just the centered logo), wallet
        // options before email. (Privy config takes literal hexes — the
        // token values, kept in sync with globals.css.)
        appearance: {
          theme: "#0A0B05",
          accentColor: "#CCFF00",
          // Passed as an element (not a bare URL) wrapped in a full-width
          // The SDK now accepts ONLY a string or a bare SVG/IMG element (the
          // old span-wrapped centering hack renders nothing since the Privy
          // bump). A block img with auto margins centers itself instead.
          logo: (
            // eslint-disable-next-line @next/next/no-img-element -- element handed to Privy's config; next/image can't render there
            <img
              key="pea-wordmark"
              src="/pea-wordmark.svg"
              alt="PEA"
              style={{ height: 34, display: "block", margin: "0 auto" }}
            />
          ),
          landingHeader: "",
          showWalletLoginFirst: true,
          walletChainType: "ethereum-only",
        },
        loginMethods: ["wallet", "email"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        // Robinhood Chain (lib/contracts.ts) — embedded wallets sign on it
        // and injected wallets are prompted to add/switch to it.
        defaultChain: CHAIN,
        supportedChains: [CHAIN],
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}
