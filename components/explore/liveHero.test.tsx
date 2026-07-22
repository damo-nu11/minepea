/**
 * LiveHero deployed-volume rows (user 2026-07-22): priced in USD off the live
 * ETH spot, with the ETH figure kept on hover.
 *
 * The pin that matters is the zero guard. The empty store snapshot carries
 * `ethUsd: 0`, so multiplying without checking renders a confident "$0.00" on
 * the rail's largest number for however long the price feed takes to answer —
 * a wrong number, not a loading state. Hooks are mocked at module level, the
 * house convention for hook-driven components.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const prices = { data: { ethUsd: 0, peaUsd: 0 }, status: "live" as const };

vi.mock("@/lib/hooks/useGame", () => ({
  usePrices: () => prices,
}));
vi.mock("@/lib/hooks/usePriceChart", () => ({
  useMarketData: () => ({ data: undefined }),
  supplyView: () => ({}),
}));
vi.mock("@/components/explore/PriceChart", () => ({
  PriceChart: () => null,
}));
vi.mock("@/lib/api/analyticsLive", () => ({
  useAnalyticsTab: () => ({ data: undefined }),
  stat: (_d: unknown, key: string) =>
    key === "totalEthDeployed" ? 1167.415 : null,
  seriesPoints: () => [{ t: 0, v: 1016.6112 }],
  rows: () => [],
}));

import { LiveHero } from "./LiveTabs";

describe("LiveHero deployed rows", () => {
  it("shows a dash, never $0.00, until the ETH price lands", () => {
    render(<LiveHero />);
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.queryByText("$0")).toBeNull();
    // Both deployed rows sit in the not-yet-known state alongside the others.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("prices both rows in compact USD once ETH spot is known", () => {
    prices.data.ethUsd = 1936.655;
    render(<LiveHero />);
    // 1016.6112 x 1936.655 and 1167.415 x 1936.655, four significant figures.
    expect(screen.getByText("$1.969M")).toBeInTheDocument();
    expect(screen.getByText("$2.261M")).toBeInTheDocument();
    // The ETH figure is not dropped, it moves to the label's hover detail.
    expect(screen.getByText("24h Deployed")).toBeInTheDocument();
    prices.data.ethUsd = 0;
  });
});
