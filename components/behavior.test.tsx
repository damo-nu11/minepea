/**
 * Behavior pins (audit r2): mutation-resistant tests for fixes that the smoke
 * suite could not distinguish from regressions —
 * - percent/MAX chips FLOOR (fmtToken's round-half-up would fail these)
 * - MinersFeed shows PREVIOUS rounds only, with per-wallet PEA + ETH rewards
 *   incl. splits (user 2026-07-17; supersedes the latest-populated rule)
 * The wallet is provided directly through WalletContext so balances are exact.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectButton } from "@/components/ConnectButton";
import { MinePage } from "@/components/mine/MinePage";
import { MinersFeed } from "@/components/mine/MinersFeed";
import { StakePage } from "@/components/stake/StakePage";
import { EngineProvider } from "@/lib/engineContext";
import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
import { ethToWei } from "@/lib/mock/engine";
import { avatarKey, usernameKey } from "@/lib/profile";
import type { BalancesVM, EngineSnapshot, Store } from "@/lib/types";
import { WalletContext, type WalletContextValue } from "@/lib/walletContext";

function walletCtx(eth: number, pea: number): WalletContextValue {
  const balances: BalancesVM = {
    eth,
    ethFormatted: String(eth),
    pea,
    peaFormatted: String(pea),
  };
  return {
    status: "connected",
    address: "0x1111111111111111111111111111111111111111",
    connect: async () => {},
    disconnect: () => {},
    balances: { data: balances, status: "live" },
    refreshBalances: () => {},
  };
}

function fixtureStore(
  feedRounds: number[] = [100],
  historyPatch: Partial<EngineSnapshot["history"][number]> = {},
): Store<EngineSnapshot> {
  const snapshot: EngineSnapshot = {
    ...SERVER_SNAPSHOT,
    bootstrapped: true,
    round: {
      ...SERVER_SNAPSHOT.round,
      roundId: 100,
      endsAt: Date.now() + 30_000,
    },
    feed: feedRounds.map((roundId, i) => ({
      id: i + 1,
      roundId,
      miner: `0x${String(i + 1).repeat(4).padEnd(40, "0")}` as `0x${string}`,
      tiles: [0],
      amountWei: ethToWei(0.1 * (i + 1)),
      at: Date.now(),
    })),
    // Settled summary of round 99 (the feed's "previous round"): winning
    // tile 0 is the one the fixture deploys cover — drives the popover.
    history: [
      {
        roundId: 99,
        winningTile: 0,
        winner: "0x1111000000000000000000000000000000000000",
        isSplit: false,
        winnerCount: 10,
        deployedWei: ethToWei(5.5),
        vaultedWei: ethToWei(0.5),
        winningsWei: ethToWei(5),
        motherlodePea: null,
        settledAt: Date.now() - 5_000,
        ...historyPatch,
      },
    ],
    prices: { peaUsd: 12, ethUsd: 3800 },
  };
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
  };
}

function wrap(ui: React.ReactNode, wallet: WalletContextValue, store = fixtureStore()) {
  return render(
    <EngineProvider store={store}>
      <WalletContext.Provider value={wallet}>{ui}</WalletContext.Provider>
    </EngineProvider>,
  );
}

describe("percent/MAX chips FLOOR (round-half-up regression pins)", () => {
  it("Stake 25% floors at 6dp: 0.0000076 PEA → 0.000001 (rounding would give 0.000002)", () => {
    wrap(<StakePage />, walletCtx(1, 0.0000076));
    fireEvent.click(screen.getByRole("button", { name: "25%" }));
    expect(
      (screen.getByRole("textbox", { name: /PEA to deposit/i }) as HTMLInputElement)
        .value,
    ).toBe("0.000001");
  });

  it("Mine MAX floors at 4dp: ALL tiles, 2.4517 ETH → 0.0976/tile (rounding would give 0.0977)", () => {
    wrap(<MinePage />, walletCtx(2.4517, 0));
    fireEvent.click(screen.getByRole("button", { name: "ALL" }));
    fireEvent.click(screen.getByRole("button", { name: "MAX" }));
    expect(
      (screen.getByRole("textbox", { name: /ETH per tile/i }) as HTMLInputElement)
        .value,
    ).toBe("0.0976");
  });
});

describe("MinersFeed previous-rounds-only filter + rewards", () => {
  it("shows PREVIOUS rounds only — current-round deploys never appear", () => {
    // Feed holds one event from round 99 and one from 100 (current). The
    // panel is a record of the last finished round (user 2026-07-17), so
    // the current round's 0.2 deploy must NOT render.
    wrap(<MinersFeed />, walletCtx(1, 1), fixtureStore([99, 100]));
    expect(screen.getByText("0.1")).toBeInTheDocument();
    expect(screen.queryByText("0.2")).not.toBeInTheDocument();
  });

  it("falls back to the previous round's deploys when the current round is empty", () => {
    wrap(<MinersFeed />, walletCtx(1, 1), fixtureStore([99]));
    expect(screen.getByText("0.1")).toBeInTheDocument();
  });

  it("renders the designed empty state when the feed has no events at all", () => {
    wrap(<MinersFeed />, walletCtx(1, 1), fixtureStore([]));
    expect(screen.getByText(/no deploys yet/i)).toBeInTheDocument();
  });

  it("focusing a row opens the popover: 25-cell replica, winner marked, reward share", () => {
    // Round 99 only — the shown round must have a settled summary to pop.
    wrap(<MinersFeed />, walletCtx(1, 1), fixtureStore([99]));
    const row = screen.getByText("0.1").closest("li")!;
    fireEvent.focus(row);

    const popover = document.querySelector('[role="tooltip"]')!;
    expect(popover).not.toBeNull();
    // The replica is a miniature of the REAL pentagon, one tile per pod.
    const cells = popover.querySelectorAll("svg > g");
    expect(cells).toHaveLength(25);
    // Tile #1 (id 0) is BOTH deployed and the winner — the white winner
    // marker must override the lime deployed tint (reference-marker rule).
    const winnerRect = cells[0].querySelector("rect")!;
    expect(winnerRect.getAttribute("fill")).toBe("var(--color-fg)");
    expect(winnerRect.getAttribute("stroke")).toBe("var(--color-fg)");
    expect(winnerRect.getAttribute("stroke")).not.toContain("204,255,0");
    // Solo PEA winner ⇒ the full 1 PEA (rewards are PEA-only, user
    // 2026-07-17 — the ETH they deployed is not a reward).
    expect(popover.textContent).toContain("Rewards");
    expect(popover.textContent).toContain("1.0000");

    fireEvent.blur(row);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("crowns the solo winner's row (PEA badge) and tags the connected wallet with YOU", () => {
    const ctx = walletCtx(1, 1);
    ctx.address = "0x1111000000000000000000000000000000000000";
    wrap(<MinersFeed />, ctx, fixtureStore([99]));
    expect(screen.getByText("YOU")).toBeInTheDocument();
    // Reward badge in the ROW (popover closed): PEA only, no ETH badge.
    expect(screen.getByText("+1.0000")).toBeInTheDocument();
    expect(screen.queryByText("+5")).not.toBeInTheDocument();
  });

  it("YOU rows wear the local profile: saved username + avatar replace the defaults", () => {
    const mine = "0x1111000000000000000000000000000000000000";
    localStorage.setItem(usernameKey(mine), "peamaxi");
    localStorage.setItem(avatarKey(mine), "data:image/jpeg;base64,Zg==");
    try {
      const ctx = walletCtx(1, 1);
      ctx.address = mine;
      wrap(<MinersFeed />, ctx, fixtureStore([99]));
      expect(screen.getByText("peamaxi")).toBeInTheDocument();
      // The address is replaced, not duplicated alongside the name.
      expect(screen.queryByText("0x1111...0000")).not.toBeInTheDocument();
      const avatar = document.querySelector('img[src^="data:image/jpeg"]');
      expect(avatar).not.toBeNull();
    } finally {
      localStorage.clear();
    }
  });

  it("a profile set on one wallet never shows on another", () => {
    // Regression (2026-07-22): the keys were browser-global, so connecting a
    // second wallet wore the first one's name and photo, and saving pushed
    // that photo to the second wallet's PUBLIC row.
    const other = "0x9999000000000000000000000000000000000000";
    localStorage.setItem(usernameKey(other), "peamaxi");
    localStorage.setItem(avatarKey(other), "data:image/jpeg;base64,Zg==");
    try {
      const ctx = walletCtx(1, 1);
      ctx.address = "0x1111000000000000000000000000000000000000";
      wrap(<MinersFeed />, ctx, fixtureStore([99]));
      expect(screen.queryByText("peamaxi")).not.toBeInTheDocument();
      expect(screen.getByText("0x1111...0000")).toBeInTheDocument();
      expect(
        document.querySelector('img[src^="data:image/jpeg"]'),
      ).toBeNull();
    } finally {
      localStorage.clear();
    }
  });

  it("drops the pre-namespace keys rather than adopting them", () => {
    // They record no wallet, so adopting would attach one wallet's photo to
    // whichever wallet connected next — the bug itself.
    localStorage.setItem("pea-username", "peamaxi");
    localStorage.setItem("pea-avatar", "data:image/jpeg;base64,Zg==");
    try {
      const ctx = walletCtx(1, 1);
      ctx.address = "0x1111000000000000000000000000000000000000";
      wrap(<MinersFeed />, ctx, fixtureStore([99]));
      expect(screen.queryByText("peamaxi")).not.toBeInTheDocument();
      expect(localStorage.getItem("pea-username")).toBeNull();
      expect(localStorage.getItem("pea-avatar")).toBeNull();
    } finally {
      localStorage.clear();
    }
  });

  it("split rounds show pro-rata PEA for every covering wallet, PEA only", () => {
    // Two miners on the winning tile, 0.1 vs 0.2 ETH ⇒ shares 1/3 and 2/3
    // of the 1 minted PEA (pro-rata, the stated economics). No ETH badges.
    wrap(
      <MinersFeed />,
      walletCtx(1, 1),
      fixtureStore([99, 99], { isSplit: true, winner: null, winnerCount: 2 }),
    );
    expect(screen.getByText("+0.3333")).toBeInTheDocument();
    expect(screen.getByText("+0.6667")).toBeInTheDocument();
    expect(screen.queryByText("+1.667")).not.toBeInTheDocument();
    expect(screen.queryByText("+3.333")).not.toBeInTheDocument();
  });
});

describe("ConnectButton profile panel", () => {
  it("connected click opens the drawer (no disconnect); Disconnect lives inside", () => {
    const ctx = walletCtx(1, 2.5);
    let disconnected = false;
    ctx.disconnect = () => {
      disconnected = true;
    };
    wrap(<ConnectButton />, ctx);

    fireEvent.click(screen.getByRole("button", { name: "0x1111...1111" }));
    expect(screen.getByRole("dialog", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    // Full PEA portfolio: Wallet + Staked/Harvested/Unharvested + Total
    // (harvest terminology, user 2026-07-18).
    for (const row of ["Wallet", "Staked", "Harvested", "Unharvested", "Total"]) {
      expect(screen.getByText(row)).toBeInTheDocument();
    }
    expect(screen.getAllByText("2.5")).toHaveLength(2); // Wallet AND Total (others 0)
    // Icon-only controls with accessible names; RPC row removed.
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit username" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload profile picture" })).toBeInTheDocument();
    expect(screen.queryByText("RPC")).toBeNull();
    expect(disconnected).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(disconnected).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the drawer wears THIS wallet's profile and never another's", async () => {
    // The panel is the path that publishes to the shared row, so a leak here
    // pushed one wallet's photo onto a different wallet's PUBLIC profile.
    const mine = "0x1111111111111111111111111111111111111111";
    const other = "0x9999999999999999999999999999999999999999";
    localStorage.setItem(usernameKey(mine), "peamaxi");
    localStorage.setItem(usernameKey(other), "someoneelse");
    try {
      wrap(<ConnectButton />, walletCtx(1, 2.5));
      fireEvent.click(screen.getByRole("button", { name: "0x1111...1111" }));
      expect(await screen.findByText("peamaxi")).toBeInTheDocument();
      expect(screen.queryByText("someoneelse")).not.toBeInTheDocument();
    } finally {
      localStorage.clear();
    }
  });

  it("dialog keyboard contract: focus moves in on open, Escape in edit cancels the edit only", () => {
    wrap(<ConnectButton />, walletCtx(1, 2.5));
    fireEvent.click(screen.getByRole("button", { name: "0x1111...1111" }));

    // Focus lands inside the dialog (audit: none of it existed).
    const dialog = screen.getByRole("dialog", { name: "Profile" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Backdrop must not be a focusable button (invisible tab stop).
    expect(screen.queryByRole("button", { name: "Close profile" })).toBeNull();

    // Escape while editing the username cancels the EDIT, not the drawer.
    fireEvent.click(screen.getByRole("button", { name: "Edit username" }));
    const input = screen.getByRole("textbox", { name: "Username" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Username" })).toBeNull();

    // Plain Escape (not editing) closes the drawer.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("scroll-locks the page while open and restores on close", () => {
    wrap(<ConnectButton />, walletCtx(1, 2.5));
    fireEvent.click(screen.getByRole("button", { name: "0x1111...1111" }));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });
});
