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
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectButton } from "@/components/ConnectButton";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { EngineProvider } from "@/lib/engineContext";
import { USERNAME_MAX } from "@/lib/hooks/useProfileEditor";
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
    // 38 / 3800 puts PEA at exactly 0.01 ETH, so the PEA-inclusive money
    // figures below are checkable by eye.
    prices: { peaUsd: 38, ethUsd: 3800 },
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

  it("the username field is fluid and length-capped on BOTH surfaces", async () => {
    // Measured 2026-07-31: a fixed w-36 input plus the Save button needed
    // 301px beside the label, and the /profile card's content box is 272px
    // (320 column − ChartCard p-6 each side), so Save hung 29px past the
    // card edge. A fixed width cannot be right on two surfaces of
    // different widths, so neither has one. min-w-0 matters twice over:
    // flex items floor at content width, and an input's floor is its
    // `size` default of ~20 characters.
    const check = (input: HTMLElement, where: string) => {
      const cls = input.className;
      expect(cls, `${where}: no fixed width`).not.toMatch(/(^|\s)w-\d/);
      expect(cls, `${where}: can shrink`).toMatch(/min-w-0/);
      expect(cls, `${where}: takes the free space`).toMatch(/flex-1/);
      // saveUsername slices to the same constant. When only the save
      // clamped, the field took 60 characters and dropped 36 silently.
      expect(input).toHaveAttribute("maxlength", String(USERNAME_MAX));
    };

    const page = wrap(<ProfilePage />, walletCtx(A));
    fireEvent.click(await screen.findByRole("button", { name: "Edit username" }));
    check(screen.getByRole("textbox", { name: "Username" }), "/profile");
    page.unmount();

    wrap(<ConnectButton />, walletCtx(A));
    fireEvent.click(screen.getByRole("button", { name: /0x1111/i }));
    expect(
      await screen.findByRole("dialog", { name: "Profile" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit username" }));
    check(screen.getByRole("textbox", { name: "Username" }), "drawer");
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

  it("always offers the link: it is /profile's only entry point", async () => {
    // No nav slot anywhere (user 2026-07-30), so if this button stops
    // rendering the page becomes unreachable for everyone who does not
    // already know the URL. It carries no env gate for that reason.
    wrap(<ConnectButton />, walletCtx(A));
    fireEvent.click(screen.getByRole("button", { name: /0x1111/i }));
    expect(
      await screen.findByRole("dialog", { name: "Profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View full profile" }),
    ).toHaveAttribute("href", "/profile");
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
    // The totals fold still runs (records read it) but no headline
    // scoreboard renders: net PnL, deployed and win rate stay unshipped.
    expect(screen.queryByText("NET PNL")).not.toBeInTheDocument();
    expect(screen.queryByText("WIN RATE")).not.toBeInTheDocument();
    expect(screen.queryByText("+$380.00")).not.toBeInTheDocument();
  });

  it("renders the records card from the same totals fold, PEA counted", () => {
    wrap(<ProfilePage />, walletCtx(A), fixtureStore(ROUNDS));
    expect(
      screen.getByRole("heading", { level: 2, name: "Records" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Best round")).toBeInTheDocument();
    // Round 50: 0.4 won on 0.1 deployed = +0.3 ETH, PLUS its 1 PEA
    // emission at 0.01 ETH. The record must agree with the table's Net
    // column, which counts the same emission.
    const best = screen.getByText("+0.31 ETH");
    // ONE text node, so the unit can never wrap away from the number the
    // way "ETH" did onto its own line beside the round id.
    expect(best).toHaveClass("whitespace-nowrap");
    // The round id sat here and pushed the pair past the card (user
    // 2026-07-31: it is not needed). Scoped to THIS card — the history
    // table's own round ids are correct and must stay.
    const card = screen
      .getByRole("heading", { level: 2, name: "Records" })
      .closest("div.rounded-\\[16px\\]")!;
    expect(within(card as HTMLElement).queryByText(/#\d/)).toBeNull();
  });

  it("the Net column counts PEA, so a round can be up on a down ETH leg", () => {
    // 0.12 back on 0.1 deployed is +0.02 ETH; the 1 PEA emission at 0.01
    // takes it to +0.03, which is +30% of the stake, not the +20% an
    // ETH-only column reported.
    wrap(
      <ProfilePage />,
      walletCtx(A),
      fixtureStore([userRound(51, "won", 0.1, 0.12)]),
    );
    const net = screen.getByText("+0.03");
    expect(net).toBeInTheDocument();
    expect(screen.getByText("+30.00%")).toBeInTheDocument();
    expect(screen.queryByText("+20.00%")).not.toBeInTheDocument();
    // Green, because the round made money.
    expect(net.closest("td")).toHaveClass("text-accent");
  });

  it("a break-even round is flat and muted, never a coral minus zero", () => {
    // 0.09 back on 0.1 plus 1 PEA at 0.01 is EXACTLY flat, but in floating
    // point it lands on -8.7e-18: not === 0, so it took the negative
    // branch and painted "-0" / "-0.00%" in the loss colour.
    wrap(
      <ProfilePage />,
      walletCtx(A),
      fixtureStore([userRound(51, "won", 0.1, 0.09)]),
    );
    const net = screen.getByText("0", { selector: "td span span" });
    expect(net).toBeInTheDocument();
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
    expect(screen.queryByText("-0.00%")).not.toBeInTheDocument();
    expect(net.closest("td")).not.toHaveClass("text-danger");
  });

  it("renders the history rows and filters to winners only", () => {
    wrap(<ProfilePage />, walletCtx(A), fixtureStore(ROUNDS));
    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.getByText("Lost")).toBeInTheDocument();
    // A switch, not a button: the state is carried by aria-checked.
    const filter = screen.getByRole("switch", { name: "Winners only" });
    expect(filter).toHaveAttribute("aria-checked", "false");
    fireEvent.click(filter);
    expect(filter).toHaveAttribute("aria-checked", "true");
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
