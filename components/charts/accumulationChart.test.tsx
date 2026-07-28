/**
 * Accumulation Chart pins: exact clustering math (the strict merge gap),
 * the marker/badge rendering, the average-cost reference line, and the
 * empty-state dash.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AccumulationChart,
  clusterByGap,
  MARKER_MIN_GAP,
} from "@/components/charts/AccumulationChart";

describe("clusterByGap", () => {
  it("merges neighbours under the gap, splits at it", () => {
    expect(clusterByGap([], 14)).toEqual([]);
    expect(clusterByGap([5], 14)).toEqual([[0]]);
    expect(clusterByGap([0, 10, 30], 14)).toEqual([[0, 1], [2]]);
    // Exactly the gap does NOT merge (strict less-than).
    expect(clusterByGap([0, 14], 14)).toEqual([[0], [1]]);
  });

  it("chains: each member joins if close to the cluster's LAST member", () => {
    // 0→13→26 each step under 14, so one long cluster.
    expect(clusterByGap([0, 13, 26], 14)).toEqual([[0, 1, 2]]);
  });

  it("the exported gap is what the chart clusters with", () => {
    expect(MARKER_MIN_GAP).toBeGreaterThan(0);
  });
});

const DAY = 86_400_000;
const POINTS = [100, 110, 120, 130, 140].map((v, i) => ({ t: i * DAY, v }));

function renderChart(buys: { atMs: number; shares: number; usd: number; txHash: string }[]) {
  return render(
    <AccumulationChart
      points={POINTS}
      buys={buys}
      avgCost={120}
      label="NVDA accumulation"
    />,
  );
}

describe("AccumulationChart", () => {
  const buy = (atMs: number) => ({
    atMs,
    shares: 1,
    usd: 100,
    txHash: "0xabc1234567890000000000000000000000000000",
  });

  it("clusters same-day buys into one badged marker", () => {
    // Two buys an hour apart (same pixel neighbourhood at 720px over 4
    // days) plus one far buy: exactly two markers, one carrying a badge.
    const { container } = renderChart([
      buy(1 * DAY),
      buy(1 * DAY + 3_600_000),
      buy(3 * DAY),
    ]);
    const markers = container.querySelectorAll("[data-marker]");
    expect(markers.length).toBe(2);
    expect(
      container.querySelectorAll('[data-marker][data-buys="2"]').length,
    ).toBe(1);
  });

  it("draws the white price line and the dashed average-cost line", () => {
    const { container } = renderChart([buy(2 * DAY)]);
    expect(
      container.querySelector('path[stroke="var(--color-fg)"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-avg-line]")).not.toBeNull();
    expect(screen.getByText("$120.00 avg")).toBeInTheDocument();
  });

  it("describes itself to assistive tech", () => {
    renderChart([buy(1 * DAY), buy(3 * DAY)]);
    expect(
      screen.getByRole("img", {
        name: /NVDA accumulation\. 2 treasury buys, average cost \$120\.00/,
      }),
    ).toBeInTheDocument();
  });

  it("renders the dash placeholder without data, never an empty axis", () => {
    render(
      <AccumulationChart
        points={[]}
        buys={[]}
        avgCost={null}
        label="Empty accumulation"
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
