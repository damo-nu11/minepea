/**
 * /profile P0 pins (plan: reference/profile-plan.md):
 * - the drawer's "View full profile" button closes the drawer AND restores
 *   the body scroll lock (the portal drawer survives route changes, so an
 *   unclosed drawer would leave the destination page scroll-locked)
 * - the page wears THIS wallet's profile, never another wallet's
 * - the shared editor seam is EVENT-SUBSCRIBED: a profile change announced
 *   elsewhere updates the page without an address change (the drift fix —
 *   removing the listener turns this red)
 * - useProfiles' Supabase select stays pinned to the three identity
 *   columns (adding a heavy column there would ship in every feed
 *   identity lookup — audit guard)
 * - disconnected state renders the connect prompt, never a blank page
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectButton } from "@/components/ConnectButton";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { EngineProvider } from "@/lib/engineContext";
import { ethToWei } from "@/lib/mock/engine";
import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
import { announceProfileChange, usernameKey } from "@/lib/profile";
import type {
  BalancesVM,
  EngineSnapshot,
  Store,
  UserRoundWire,
} from "@/lib/types";
import { WalletContext, type WalletContextValue } from "@/lib/walletContext";

// The page and drawer link with next/link; behavior under test is the
// onClick contract, so the mock renders a plain anchor (jsdom no-ops the
// navigation itself).
vi.mock("next/link", () => ({
  default: ({
    href,
    onClick,
    children,
    className,
  }: {
    href: string;
    onClick?: () => void;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x2222222222222222222222222222222222222222" as const;

function walletCtx(
  address: `0x${string}` | null,
  status: WalletContextValue["status"] = "connected",
): WalletContextValue {
  const balances: BalancesVM = {
    eth: 1.5,
    ethFormatted: "1.5",
    pea: 10,
    peaFormatted: "10",
  };
  return {
    status,
    address,
    connect: async () => {},
    disconnect: () => {},
    balances: { data: balances, status: "live" },
    refreshBalances: () => {},
  };
}

function userRound(
  roundId: number,
  outcome: UserRoundWire["outcome"],
  deployedEth: number,
  wonEth: number,
): UserRoundWire {
  return {
    roundId,
    settledAt: roundId * 60_000,
    outcome,
    isSplit: false,
    peapotHit: false,
    winningTile: 3,
    tiles: [3, 7],
    deployedWei: ethToWei(deployedEth),
    wonEthWei: ethToWei(wonEth),
    wonPeaWei: outcome === "won" ? (10n ** 18n).toString() : "0",
    peapotPeaWei: "0",
    source: "manual",
  };
}

function fixtureStore(
  userRounds: UserRoundWire[] = [],
): Store<EngineSnapshot> {
  const snapshot: EngineSnapshot = {
    ...SERVER_SNAPSHOT,
    bootstrapped: true,
    prices: { peaUsd: 12, ethUsd: 3800 },
    userRounds,
  };
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
  };
}

function wrap(
  ui: React.ReactNode,
  wallet: WalletContextValue,
  store = fixtureStore(),
) {
  return render(
    <EngineProvider store={store}>
      <WalletContext.Provider value={wallet}>{ui}</WalletContext.Provider>
    </EngineProvider>,
  );
}

describe("ProfilePage P0", () => {
  it("View full profile closes the drawer and restores body scroll", async () => {
    // The drawer's link is env-gated while /profile is being built; the
    // close + scroll-restore contract is what this pins for when it ships.
    vi.stubEnv("NEXT_PUBLIC_PROFILE_PAGE", "1");
    try {
      wrap(<ConnectButton />, walletCtx(A));
      fireEvent.click(screen.getByRole("button", { name: /0x1111/i }));
      expect(
        await screen.findByRole("dialog", { name: "Profile" }),
      ).toBeInTheDocument();
      expect(document.body.style.overflow).toBe("hidden");
      fireEvent.click(screen.getByRole("link", { name: "View full profile" }));
      expect(
        screen.queryByRole("dialog", { name: "Profile" }),
      ).not.toBeInTheDocument();
      expect(document.body.style.overflow).not.toBe("hidden");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps focus in the username field while typing (drawer)", async () => {
    // The dialog effect must NOT re-run on every render. When its deps
    // held a fresh-arrow callback, each keystroke re-ran the effect and
    // its cleanup/setup pair moved focus to the close button, so only the
    // first character ever landed. Two characters is what catches it.
    wrap(<ConnectButton />, walletCtx(A));
    fireEvent.click(screen.getByRole("button", { name: /0x1111/i }));
    expect(
      await screen.findByRole("dialog", { name: "Profile" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit username" }));
    const input = screen.getByRole("textbox", { name: "Username" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "a" } });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "ab" } });
    expect(document.activeElement).toBe(input);
  });

  it("clears the edit buffer on a wallet switch (never writes A's name to B)", async () => {
    const { rerender } = wrap(<ProfilePage />, walletCtx(A));
    fireEvent.click(await screen.findByRole("button", { name: "Edit username" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), {
      target: { value: "alpha-name" },
    });
    // Wallet switches underneath the open editor.
    rerender(
      <EngineProvider store={fixtureStore()}>
        <WalletContext.Provider value={walletCtx(B)}>
          <ProfilePage />
        </WalletContext.Provider>
      </EngineProvider>,
    );
    // The editor must have closed rather than carrying A's draft into B.
    expect(
      screen.queryByRole("textbox", { name: "Username" }),
    ).not.toBeInTheDocument();
  });

  it("hides the drawer link until the page is launched (env gate)", async () => {
    wrap(<ConnectButton />, walletCtx(A));
    fireEvent.click(screen.getByRole("button", { name: /0x1111/i }));
    expect(
      await screen.findByRole("dialog", { name: "Profile" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View full profile" }),
    ).not.toBeInTheDocument();
  });

  it("wears THIS wallet's profile, never another wallet's", async () => {
    localStorage.setItem(usernameKey(A), "alpha");
    localStorage.setItem(usernameKey(B), "beta");
    try {
      wrap(<ProfilePage />, walletCtx(A));
      expect(await screen.findByText("alpha")).toBeInTheDocument();
      expect(screen.queryByText("beta")).not.toBeInTheDocument();
    } finally {
      localStorage.removeItem(usernameKey(A));
      localStorage.removeItem(usernameKey(B));
    }
  });

  it("updates when a profile change is announced elsewhere (shared-seam sync)", async () => {
    localStorage.setItem(usernameKey(A), "alpha");
    try {
      wrap(<ProfilePage />, walletCtx(A));
      expect(await screen.findByText("alpha")).toBeInTheDocument();
      // Another surface (the drawer) saves a new name: same storage, same
      // event — no address change involved.
      localStorage.setItem(usernameKey(A), "delta");
      act(() => announceProfileChange());
      expect(await screen.findByText("delta")).toBeInTheDocument();
      expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    } finally {
      localStorage.removeItem(usernameKey(A));
    }
  });

  it("pins useProfiles' Supabase select to the three identity columns", () => {
    const src = readFileSync(
      join(process.cwd(), "lib", "profile.ts"),
      "utf8",
    );
    expect(src).toMatch(/\.select\("address,username,avatar"\)/);
  });

  it("renders the connect prompt when disconnected, never a blank page", () => {
    wrap(<ProfilePage />, walletCtx(null, "disconnected"));
    expect(
      screen.getByRole("heading", { level: 1, name: "Profile." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Connect a wallet/)).toBeInTheDocument();
  });

  it("says it is checking while initializing, never 'connect a wallet'", () => {
    // /profile is server-rendered, so an already-connected user briefly
    // gets this state on every load. Telling them to connect asserts the
    // opposite of the truth and any paused frame reads as logged out.
    wrap(<ProfilePage />, walletCtx(null, "initializing"));
    expect(screen.getByText(/Checking your wallet/)).toBeInTheDocument();
    expect(screen.queryByText(/Connect a wallet/)).not.toBeInTheDocument();
    // Still not a skeleton: a provider that never initializes must not
    // strand the page on placeholder bars.
    expect(
      screen.getByRole("heading", { level: 1, name: "Profile." }),
    ).toBeInTheDocument();
  });
});

describe("ProfilePage P1 (PnL + history)", () => {
  // Two settled rounds: a +0.3 win and a −0.2 loss → net +0.1 ETH, which
  // at the fixture's $3,800 ETH quote is exactly +$380.00.
  const ROUNDS = [
    userRound(50, "won", 0.1, 0.4),
    userRound(49, "lost", 0.2, 0),
  ];

  it("keeps the PnL cards out of v1 (they ship with the share cards)", () => {
    wrap(<ProfilePage />, walletCtx(A), fixtureStore(ROUNDS));
    // The totals fold still runs (trophies read it) but no headline
    // scoreboard renders: net PnL, deployed and win rate stay unshipped.
    expect(screen.queryByText("NET PNL")).not.toBeInTheDocument();
    expect(screen.queryByText("WIN RATE")).not.toBeInTheDocument();
    expect(screen.queryByText("+$380.00")).not.toBeInTheDocument();
  });

  it("renders trophies from the same totals fold", () => {
    wrap(<ProfilePage />, walletCtx(A), fixtureStore(ROUNDS));
    expect(screen.getByText("Best round")).toBeInTheDocument();
    // Round 50 netted +0.3 ETH (0.4 won on 0.1 deployed).
    expect(screen.getByText("+0.3 ETH")).toBeInTheDocument();
  });

  it("renders the history rows and filters to winners only", () => {
    wrap(<ProfilePage />, walletCtx(A), fixtureStore(ROUNDS));
    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.getByText("Lost")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Winners only" }));
    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.queryByText("Lost")).not.toBeInTheDocument();
  });

  it("expands a row into the board replay with the round's facts", () => {
    wrap(<ProfilePage />, walletCtx(A), fixtureStore(ROUNDS));
    fireEvent.click(screen.getByRole("button", { name: "Round 50 details" }));
    expect(screen.getByText("Winning tile")).toBeInTheDocument();
    expect(screen.getByText("4, 8")).toBeInTheDocument(); // tiles 3,7 → 1-based
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("empty history keeps the designed state with a path back to Mine", () => {
    wrap(<ProfilePage />, walletCtx(A), fixtureStore([]));
    expect(
      screen.getByText(/Your settled rounds will appear here/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Mine a round" }),
    ).toBeInTheDocument();
  });
});
