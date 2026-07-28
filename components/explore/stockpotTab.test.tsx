/**
 * Stockpot tab P0 pins: renders the factsheet from the deterministic mock,
 * the provenance strip carries the periphery contracts, the per-stock table
 * leads with pending/paid-out (never a "holdings" wall of zeros), and the
 * color law holds (lime never colors table figures).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StockpotTab, StockTile } from "@/components/explore/StockpotTab";
import { STOCKPOT_MOCK } from "@/lib/mock/stockpot";
import { toStockpotVM } from "@/lib/stockpot/mappers";

// The tab reads the live chain through useStockpot; tests pin the RENDER,
// so the hook serves the deterministic mock bundle instead of the network.
// hookState lets individual tests flip flags (truncated) without a second
// module mock.
const hookState = vi.hoisted(() => ({ truncated: false }));
// A fresh pending feed: 5 ETH accruing, nothing held. At the stubbed
// $1,900 ETH quote that is $9,500 in the pot and a $1,900.00 pending
// slice per stock (the even five-way split).
const PENDING_CTX = vi.hoisted(() => ({
  pending: {
    marketOpen: true,
    pendingEthWei: "5000000000000000000",
    pendingStocks: [] as { address: string; amountWei: string }[],
    updatedAtMs: 0,
    stale: false,
  },
  ethUsd: 1900,
}));

// The tab reads the live ETH quote for the pot's accruing-ETH component;
// tests stub it (no engine provider mounts here).
vi.mock("@/lib/hooks/useGame", () => ({
  usePrices: () => ({
    data: { peaUsd: 500, ethUsd: 1900 },
    status: "live" as const,
  }),
}));
vi.mock("@/lib/hooks/useStockpot", async () => {
  const { STOCKPOT_MOCK: wire, STOCKPOT_MOCK_HISTORY } = await import(
    "@/lib/mock/stockpot"
  );
  const { toStockpotVM: map } = await import("@/lib/stockpot/mappers");
  const base = {
    vm: map(wire, PENDING_CTX),
    history: STOCKPOT_MOCK_HISTORY,
  };
  return {
    useStockpot: () => ({
      data: { ...base, truncated: hookState.truncated },
      status: "live" as const,
      pricesLive: true,
    }),
  };
});

const mockVm = () => toStockpotVM(STOCKPOT_MOCK, PENDING_CTX);

describe("StockpotTab", () => {
  it("renders the factsheet blocks from the mock", () => {
    render(<StockpotTab />);
    const vm = mockVm();
    // Headline pot total, whole dollars, exactly as the mapper formats it.
    expect(screen.getByText(vm.totalUsdFormatted)).toBeInTheDocument();
    // Twice by design: the headline stat card and the provenance row.
    expect(screen.getAllByText("THE POT")).toHaveLength(2);
    // Provenance: the real pot address (confirmed live onchain 2026-07-28)
    // and the periphery rows, plus the per-stock table.
    expect(screen.getByText("0x8142...2F50")).toBeInTheDocument();
    expect(screen.getByText("FEE COLLECTOR")).toBeInTheDocument();
    expect(screen.getByText("DISPERSER")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Stockpot payouts by stock table" }),
    ).toBeInTheDocument();
    // Every registry ticker rows up.
    for (const s of vm.stocks) {
      expect(screen.getAllByText(s.ticker).length).toBeGreaterThan(0);
    }
    // The paid-out figures come from the mock's payout ledger.
    expect(
      screen.getAllByText(vm.stocks[0].paidOutUsdFormatted).length,
    ).toBeGreaterThan(0);
  });

  it("renders the pending column from the feed's even five-way split", () => {
    render(<StockpotTab />);
    // 5 ETH × $1,900 divided across the five stocks = $1,900.00 each.
    expect(screen.getAllByText("$1,900.00").length).toBeGreaterThanOrEqual(5);
  });

  it("keeps lime out of the per-stock table (color law)", () => {
    render(<StockpotTab />);
    const region = screen.getByRole("region", {
      name: "Stockpot payouts by stock table",
    });
    for (const el of region.querySelectorAll("td, td *")) {
      expect((el as HTMLElement).className).not.toContain("text-accent");
    }
  });

  it("renders the supplied logo tile for every stock", () => {
    const { container } = render(<StockpotTab />);
    for (const s of mockVm().stocks) {
      if (!s.icon) continue;
      expect(
        container.querySelector(`img[src="${s.icon}"]`),
        `logo for ${s.ticker}`,
      ).not.toBeNull();
    }
  });

  it("falls back to the ticker monogram without a logo", () => {
    render(<StockTile ticker="TEST" />);
    expect(screen.getByText("TEST")).toBeInTheDocument();
  });

  it("opens the Accumulation Chart on the most paid out stock and swaps on click", () => {
    render(<StockpotTab />);
    const vm = mockVm();
    const top = vm.stocks[0].ticker;
    const other = vm.stocks[1].ticker;
    expect(
      screen.getByRole("img", { name: new RegExp(`^${top} accumulation`) }),
    ).toBeInTheDocument();
    expect(screen.getByText(/buys shown\./)).toBeInTheDocument();
    // The switcher rows are the tab's only per-ticker buttons; clicking one
    // swaps the expanded chart to that ticker.
    fireEvent.click(screen.getByRole("button", { name: new RegExp(other) }));
    expect(
      screen.getByRole("img", { name: new RegExp(`^${other} accumulation`) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: new RegExp(`^${top} accumulation`) }),
    ).not.toBeInTheDocument();
  });

  it("stamps the blocks with the mock's as-of time, not the wall clock", () => {
    render(<StockpotTab />);
    expect(
      screen.getAllByText("As of 2026-07-28 00:00 UTC").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("softens every lifetime claim when the ledger window overflows", () => {
    hookState.truncated = true;
    try {
      render(<StockpotTab />);
      expect(screen.getAllByText("Within the ledger window")).toHaveLength(2);
      expect(
        screen.getByText(/older activity is not included/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/gone out within the ledger window/i),
      ).toBeInTheDocument();
    } finally {
      hookState.truncated = false;
    }
  });

  it("filters the accumulation window with the range chips", () => {
    render(<StockpotTab />);
    const count = () =>
      Number(
        screen
          .getByText(/buys shown\./)
          .textContent!.match(/^([\d,]+)/)![1].replace(/,/g, ""),
      );
    const all = count();
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    const week = count();
    // The mock spans 42 days of buys, so a 7-day window strictly shrinks
    // the shown count without emptying it.
    expect(week).toBeLessThan(all);
    expect(week).toBeGreaterThan(0);
  });

  it("renders the tx-linked ledger tables", () => {
    render(<StockpotTab />);
    expect(
      screen.getByRole("region", { name: "Stockpot purchases table" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Stockpot payouts table" }),
    ).toBeInTheDocument();
    // Every ledger row ends in an onchain receipt.
    const txLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.includes("/tx/"));
    expect(txLinks.length).toBeGreaterThan(0);
  });
});
