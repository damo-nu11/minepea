"use client";

/**
 * Connect pill — premium pass 2026-07-13 (user: outline version read
 * cheap). Disconnected: solid accent pill, black text, lime glow + inner
 * top light. Connected: dark pill ringed in accent with a soft glow,
 * showing the short address; clicking opens the ProfilePanel drawer
 * (disconnect lives inside the panel).
 */

import { useState } from "react";
import { ProfilePanel } from "@/components/ProfilePanel";
import { shortAddr } from "@/lib/format";
import { useWallet } from "@/lib/walletContext";

export function ConnectButton() {
  const { status, address, connect } = useWallet();
  const [panelOpen, setPanelOpen] = useState(false);

  const label =
    status === "connected" && address
      ? shortAddr(address)
      : status === "connecting"
        ? "Connecting..."
        : "Connect";

  const busy = status === "initializing" || status === "connecting";

  // Close the drawer if the wallet disconnects underneath it (audit:
  // e.g. Privy session ends) — adjust-state-during-render pattern.
  if (panelOpen && status !== "connected") setPanelOpen(false);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (status === "connected") setPanelOpen(true);
          else void connect().catch(() => {});
        }}
        className={`tnum h-9 cursor-pointer rounded-full border-[1.5px] px-4 text-[13px] font-bold transition-all disabled:opacity-60 md:h-10 md:px-5 md:text-[14px] ${
          status === "connected"
            ? "border-accent/50 bg-surface-active text-fg shadow-[0_0_20px_-6px_var(--color-accent)] hover:border-accent"
            : "border-transparent bg-accent text-on-light shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_26px_-6px_var(--color-accent)] hover:brightness-110"
        }`}
      >
        {label}
      </button>
      <ProfilePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
