"use client";

/**
 * Provider composition root. Phase 9 seams are env-gated so the local build
 * runs with zero credentials:
 * - NEXT_PUBLIC_PRIVY_APP_ID set → real Privy wallet; else the local stub
 * - NEXT_PUBLIC_API_URL set     → ApiGameStore (see engineContext); else mock
 */

import { ToastProvider } from "@/components/Toast";
import { EngineProvider } from "@/lib/engineContext";
import { UserDataProvider } from "@/lib/user/userData";
import { WalletProvider } from "@/lib/wallet";
import { PrivyWalletProvider } from "@/lib/walletPrivy";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * The two seams are gated INDEPENDENTLY, which allows a combination that
 * must never reach a DEPLOYED user: a real wallet driving the simulated
 * engine. That state is silent and completely convincing — connected
 * wallet, real on-chain balance, a locked board, a winner reveal, PEA
 * "won" — while no transaction exists and no ETH ever moved. One missing
 * Vercel variable produces it.
 *
 * In development it is a legitimate and much-used setup: it is how the
 * wallet UI gets exercised against the deterministic mock engine without
 * a backend, so it is left alone. Production refuses to render a board.
 */
function MisconfiguredBoard() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[560px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-wordmark text-[28px] font-bold text-fg">
        Configuration error
      </h1>
      <p className="text-[17px] leading-relaxed text-fg-body">
        A live wallet is configured but the game backend is not, so rounds here
        would be simulated. Nothing you did on this screen could move real
        funds. Mining is unavailable until this is corrected.
      </p>
      <p className="text-[13px] text-fg-muted">
        Set NEXT_PUBLIC_API_URL, or unset NEXT_PUBLIC_PRIVY_APP_ID to run the
        local demo.
      </p>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const walletWithoutBackend = !!PRIVY_APP_ID && !API_URL;
  // Only a DEPLOYED build can put a real user in front of this. Blocking
  // it in dev would break the standard local setup (real wallet, mock
  // rounds) for no safety gain.
  if (walletWithoutBackend && process.env.NODE_ENV === "production") {
    return (
      <ToastProvider>
        <MisconfiguredBoard />
      </ToastProvider>
    );
  }

  // UserDataProvider sits INSIDE the wallet provider (it consumes the wallet
  // identity) and inside EngineProvider (it bridges the address into the
  // game store). Inert in mock mode / while disconnected.
  const inner = <UserDataProvider>{children}</UserDataProvider>;
  const wallet = PRIVY_APP_ID ? (
    <PrivyWalletProvider appId={PRIVY_APP_ID}>{inner}</PrivyWalletProvider>
  ) : (
    <WalletProvider>{inner}</WalletProvider>
  );
  return (
    <ToastProvider>
      <EngineProvider>{wallet}</EngineProvider>
    </ToastProvider>
  );
}
