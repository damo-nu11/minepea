/**
 * Store-seam test (PLAN Phase 2 acceptance): a second in-memory store
 * implementing the same Store<EngineSnapshot> interface replaces the mock
 * engine behind the hooks with ZERO component diffs — the exact property
 * that lets the real API/SSE client swap in at Phase 9.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EngineProvider } from "@/lib/engineContext";
import { useMinersFeed, usePrices, useRound } from "@/lib/hooks/useGame";
import { ethToWei, SERVER_SNAPSHOT, type EngineSnapshot } from "@/lib/mock/engine";
import type { Store } from "@/lib/types";

/** A hand-rolled fixture store — NOT the mock engine. */
function fixtureStore(): Store<EngineSnapshot> {
  const snapshot: EngineSnapshot = {
    ...SERVER_SNAPSHOT,
    bootstrapped: true,
    round: {
      ...SERVER_SNAPSHOT.round,
      roundId: 424_242,
      endsAt: 9_999_999_999_999,
      totalDeployedWei: ethToWei(12.5),
    },
    feed: [
      {
        id: 1,
        roundId: 424_242,
        miner: "0xabcd111122223333444455556666777788889999",
        tiles: [0, 1],
        amountWei: ethToWei(0.5),
        at: 0,
      },
    ],
    prices: { peaUsd: 99.99, ethUsd: 1234.56 },
  };
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
  };
}

function Probe() {
  const round = useRound();
  const feed = useMinersFeed();
  const prices = usePrices();
  if (!round.data || !feed.data || !prices.data) return <p>loading</p>;
  return (
    <div>
      <p data-testid="round">{round.data.roundIdFormatted}</p>
      <p data-testid="deployed">{round.data.totalDeployedFormatted}</p>
      <p data-testid="feed">{feed.data[0].display}</p>
      <p data-testid="pea">{prices.data.peaUsdFormatted}</p>
    </div>
  );
}

describe("store seam", () => {
  it("hooks render from ANY Store<EngineSnapshot> implementation", () => {
    render(
      <EngineProvider store={fixtureStore()}>
        <Probe />
      </EngineProvider>,
    );
    expect(screen.getByTestId("round").textContent).toBe("#424,242");
    expect(screen.getByTestId("deployed").textContent).toBe("12.5");
    expect(screen.getByTestId("feed").textContent).toBe("0xabcd...9999");
    expect(screen.getByTestId("pea").textContent).toBe("$99.99");
  });

  it("reports loading (data undefined) on the un-bootstrapped server snapshot", () => {
    const empty: Store<EngineSnapshot> = {
      subscribe: () => () => {},
      getSnapshot: () => SERVER_SNAPSHOT,
      getServerSnapshot: () => SERVER_SNAPSHOT,
    };
    render(
      <EngineProvider store={empty}>
        <Probe />
      </EngineProvider>,
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
  });
});
