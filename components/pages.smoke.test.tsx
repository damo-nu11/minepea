/**
 * Page smoke tests (audit round 1): render every feature page inside the real
 * provider stack (fixture game store + stub wallet) and assert its key chrome
 * appears — a render crash in any page fails CI instead of shipping unseen.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ANALYTICS } from "@/lib/mock/analytics";
import { BrandPage, SWATCHES } from "@/components/brand/BrandPage";
import { ExplorePage } from "@/components/explore/ExplorePage";
import { LegalPage } from "@/components/LegalPage";
import { MinePage } from "@/components/mine/MinePage";
import { StakePage } from "@/components/stake/StakePage";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { EngineProvider } from "@/lib/engineContext";
import { DOCS_SECTIONS } from "@/lib/docsContent";
import { PRIVACY, TERMS, type LegalDoc } from "@/lib/legalContent";
import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
import { ethToWei } from "@/lib/mock/engine";
import type { EngineSnapshot, Store } from "@/lib/types";
import { WalletProvider } from "@/lib/wallet";

function fixtureStore(): Store<EngineSnapshot> {
  const snapshot: EngineSnapshot = {
    ...SERVER_SNAPSHOT,
    bootstrapped: true,
    round: {
      ...SERVER_SNAPSHOT.round,
      roundId: 100,
      endsAt: Date.now() + 30_000,
      totalDeployedWei: ethToWei(5),
    },
    feed: [
      {
        id: 1,
        // Previous round (current is 100) — the MINERS panel shows LAST
        // round's miners (user direction 2026-07-13).
        roundId: 99,
        miner: "0xaaaa111122223333444455556666777788889999",
        tiles: [0, 1, 2],
        amountWei: ethToWei(0.3),
        at: Date.now() - 5_000,
      },
    ],
    history: [
      {
        roundId: 99,
        winningTile: 7,
        winner: "0xbbbb111122223333444455556666777788889999",
        isSplit: false,
        winnerCount: 12,
        deployedWei: ethToWei(10),
        vaultedWei: ethToWei(0.95),
        winningsWei: ethToWei(9.05),
        motherlodePea: ethToWei(50),
        settledAt: Date.now() - 70_000,
      },
    ],
    prices: { peaUsd: 12.4, ethUsd: 3800 },
    protocolStats: {
      maxSupplyPea: ethToWei(3_000_000),
      circulatingPea: ethToWei(470_000),
      buried7dPea: ethToWei(7_500),
      protocolRev7dWei: ethToWei(900),
    },
    user: { deployedRound: null, deployedTiles: [], autoRemaining: 0 },
  };
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
  };
}

function wrap(ui: React.ReactNode) {
  return render(
    <EngineProvider store={fixtureStore()}>
      <WalletProvider>{ui}</WalletProvider>
    </EngineProvider>,
  );
}

describe("page smoke renders", () => {
  it("MinePage renders the pentagon board, stats strip, controls, and the feed item", () => {
    wrap(<MinePage />);
    expect(screen.getAllByText(/deployed/i).length).toBeGreaterThan(0);
    // Exactly twice on Mine: mobile above-board block + desktop sidebar copy.
    expect(screen.getAllByText("Peapot")).toHaveLength(2);
    // The vine pentagon is THE board now: 25 tiles, its peg field, its sprout.
    expect(screen.getAllByLabelText(/^Tile \d+,/)).toHaveLength(25);
    expect(
      document.querySelectorAll(
        "circle[fill='url(#vn-peg)'], circle[fill='url(#vn-peg-lit4)']",
      ).length,
    ).toBeGreaterThan(100);
    expect(document.querySelector("[data-tip]")).not.toBeNull();
    // ...and the retired 5x5 grid is gone from the page.
    expect(document.querySelectorAll("[data-tile]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "ALL" })).toBeInTheDocument();
    expect(screen.getByText("0xaaaa...9999")).toBeInTheDocument();
  });

  it("StakePage renders toggle, chips, CTA, and Summary", () => {
    wrap(<StakePage />);
    expect(screen.getByRole("heading", { name: "Stake." })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /withdraw/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
    // Pinned to the SHARED source, not a literal: Stake and Explore state
    // the same metric on the same basis, so they must never diverge.
    expect(
      screen.getByText(`${ANALYTICS.impliedApyPct.toFixed(2)}%`),
    ).toBeInTheDocument();
    // The user's own staked amount lives in the Summary (user 2026-07-17:
    // visible outside the Withdraw tab's caption).
    expect(screen.getByText("Staked")).toBeInTheDocument();
  });

  it("ExplorePage v2 renders hero, tab bar, and the live Mining tables by default", () => {
    wrap(<ExplorePage />);
    expect(
      screen.getByRole("heading", { name: "Explore." }),
    ).toBeInTheDocument();
    // Hero TOTAL SUPPLY keeps fmtInt (plan-audit pin: not compact form).
    expect(screen.getByText("3,000,000")).toBeInTheDocument();
    // All five section tabs; MINING is the default (LAST ROUND deep-link).
    for (const t of ["Mining", "Buybacks", "Token", "Staking", "Miners"]) {
      expect(screen.getByRole("tab", { name: t })).toBeInTheDocument();
    }
    // Mining tab charts (default view): peapot + the 3 added charts.
    expect(screen.getByText("Peapot Over Rounds")).toBeInTheDocument();
    expect(
      screen.getByText("Total ETH Deployed for Mining"),
    ).toBeInTheDocument();
    expect(screen.getByText("Peapot Rewards Paid Out")).toBeInTheDocument();
    expect(screen.getByText("Harvesting APR")).toBeInTheDocument();
    // Rounds AND Peapots render stacked on first paint (round #99 hit the
    // peapot in the fixture, so it appears in both tables).
    expect(
      screen.getByRole("heading", { name: "Peapots" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("#99").length).toBeGreaterThanOrEqual(1);
    // Switching tabs swaps the body (mock analytics; SIMULATED tags
    // removed per user 2026-07-13 to judge the real look).
    fireEvent.click(screen.getByRole("tab", { name: "Buybacks" }));
    expect(screen.getByText("Weekly Buybacks")).toBeInTheDocument();
    expect(screen.queryByText("SIMULATED")).toBeNull();
    // Buyback transactions paginate 12/page (60 mock rows -> 5 pages).
    expect(screen.getByText("Buyback Transactions")).toBeInTheDocument();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("2 / 5")).toBeInTheDocument();

    // Staking tab carries the Top Stakers leaderboard (paginated).
    fireEvent.click(screen.getByRole("tab", { name: "Staking" }));
    expect(screen.getByText("Top Stakers")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Top stakers table" }),
    ).toBeInTheDocument();

    // Token tab carries the Top Holders leaderboard (paginated).
    fireEvent.click(screen.getByRole("tab", { name: "Token" }));
    expect(screen.getByText("Top Holders")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Top holders table" }),
    ).toBeInTheDocument();
  });

  it("DocsLayout renders every section without crashing", () => {
    for (const section of DOCS_SECTIONS) {
      const { unmount } = render(<DocsLayout section={section} />);
      expect(
        screen.getByRole("heading", { name: `${section.title}.` }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("BrandPage renders the kit shell: swatches, real downloads, Soon slots", () => {
    render(<BrandPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Brand." }),
    ).toBeInTheDocument();
    for (const title of ["Colors", "Coin", "Wordmark", "Lockup", "FAQ"])
      expect(
        screen.getByRole("heading", { name: title }),
      ).toBeInTheDocument();
    // Seven copyable swatches (coral is a UI state, not brand identity).
    expect(
      screen.getAllByRole("button", { name: /^Copy .* #[0-9A-F]{6}$/ }),
    ).toHaveLength(7);
    expect(screen.queryByText("#FF5C5C")).not.toBeInTheDocument();
    expect(screen.getByText("#CCFF00")).toBeInTheDocument();
    // Real downloads exist ONLY for files on disk today (mock/live
    // honesty): coin PNG, wordmark + lockup in BOTH ground variants
    // (dark-bg originals plus the light-bg set generated 2026-07-29 from
    // the same vector source and layout).
    const downloads = screen
      .getAllByRole("link")
      .filter((a) => a.hasAttribute("download"))
      .map((a) => a.getAttribute("href"));
    expect(downloads.sort()).toEqual([
      "/pea-lockup-light-bg.png",
      "/pea-lockup.png",
      "/pea-logo.png",
      "/pea-wordmark-light-bg.png",
      "/pea-wordmark-light-bg.svg",
      "/pea-wordmark.png",
      "/pea-wordmark.svg",
    ]);
    // Wordmark and lockup each present both grounds, labeled.
    expect(screen.getAllByText("For dark backgrounds")).toHaveLength(2);
    expect(screen.getAllByText("For light backgrounds")).toHaveLength(2);
    // No vector coin exists (user 2026-07-29): the kit promises nothing
    // pending — every pill on the page is a real download.
    expect(screen.queryByText("Soon")).not.toBeInTheDocument();
  });
});

describe("BrandPage behavior pins", () => {
  it("swatch hexes match app/globals.css (the palette has re-themed before)", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    const tokens = new Map<string, string>();
    for (const m of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g))
      tokens.set(m[1], m[2].toUpperCase());
    for (const s of SWATCHES) {
      const token = s.cls.replace(/^bg-/, "");
      expect(tokens.get(token), `${s.name} (${token})`).toBe(s.hex);
    }
  });

  it("every download pill points at a file that exists on disk", () => {
    render(<BrandPage />);
    const hrefs = screen
      .getAllByRole("link")
      .filter((a) => a.hasAttribute("download"))
      .map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs)
      expect(
        existsSync(join(process.cwd(), "public", href.slice(1))),
        href,
      ).toBe(true);
  });

  it("claims Copied only after the write succeeds, then reverts", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    try {
      render(<BrandPage />);
      fireEvent.click(screen.getByRole("button", { name: "Copy Lime #CCFF00" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(writeText).toHaveBeenCalledWith("#CCFF00");
      expect(screen.getByText("Copied")).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
      expect(screen.getByText("#CCFF00")).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
      vi.useRealTimers();
    }
  });

  it("a failed copy says Copy failed, never Copied", async () => {
    // Clipboard API rejects AND jsdom has no execCommand: both methods
    // miss, and the page must not claim success (the honesty branch).
    vi.useFakeTimers();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    try {
      render(<BrandPage />);
      fireEvent.click(screen.getByRole("button", { name: "Copy Lime #CCFF00" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
      // Twice by design: the caption swap and the aria-live twin.
      expect(screen.getAllByText("Copy failed")).toHaveLength(2);
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
      vi.useRealTimers();
    }
  });
});

/** Every block's prose, in render order (section blocks, then subsections). */
function docText(doc: LegalDoc): string {
  return [
    ...doc.intro,
    ...doc.sections.flatMap((s) => [
      ...s.blocks,
      ...(s.subsections ?? []).flatMap((sub) => sub.blocks),
    ]),
  ]
    .flatMap((b) => [b.text, ...(b.items ?? [])])
    .join("\n");
}

describe("legal documents", () => {
  it("render both documents with numbered, citable sections", () => {
    for (const doc of [TERMS, PRIVACY]) {
      const { unmount } = render(<LegalPage doc={doc} />);
      expect(
        screen.getByRole("heading", { level: 1, name: `${doc.title}.` }),
      ).toBeInTheDocument();
      // Numbering is load-bearing: the copy cross-references clauses by number
      // ("see section 11"), so an unnumbered heading breaks the document.
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: `1. ${doc.sections[0].heading}`,
        }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("every numeric cross-reference resolves to the section it points at", () => {
    for (const doc of [TERMS, PRIVACY]) {
      const headings = doc.sections.map((s) => s.heading);
      for (const m of docText(doc).matchAll(
        /[Ss]ection (\d+)(?: \(([^)]+)\))?/g,
      )) {
        const target = headings[Number(m[1]) - 1];
        // The number must land on a real section...
        expect(target, `${doc.title}: "${m[0]}" is out of range`).toBeDefined();
        // ...and where the copy names it inline, on the one it names.
        if (m[2]) expect(target, `${doc.title}: "${m[0]}"`).toBe(m[2]);
      }
    }
  });

  it("pins the bare cross-references that name no section inline", () => {
    // These two cite by number only, so nothing above can catch them drifting.
    // Both point at Dispute Resolution, which carries the arbitration
    // agreement and the class action waiver.
    const n =
      TERMS.sections.findIndex((s) => s.heading === "Dispute Resolution") + 1;
    const text = docText(TERMS);
    expect(n).toBeGreaterThan(0);
    expect(text).toContain(`arbitration provisions in Section ${n}`);
    expect(text).toContain(
      `subject to Section ${n}, which specifies its own treatment`,
    );
  });

  it("carry no placeholders and define the Network before using the short form", () => {
    for (const doc of [TERMS, PRIVACY]) {
      const text = docText(doc);
      expect(text).not.toMatch(/\[DATE\]|\[TBD\]|TODO|XXX/);
      // House style: no em/en dashes in user-facing copy.
      expect(text).not.toMatch(/[—–]/);
      // The chain is named (user 2026-07-21): each document names Robinhood
      // Chain and defines it as "the Network" once, before any short-form use.
      const defined = text.indexOf('Robinhood Chain (the "Network")');
      expect(defined).toBeGreaterThan(-1);
      expect(text.search(/[Tt]he Network[ .,]/)).toBeGreaterThan(defined);
      // The euphemism it replaced must not creep back in.
      expect(text).not.toMatch(/Ethereum Layer-2/i);
    }
  });
});
