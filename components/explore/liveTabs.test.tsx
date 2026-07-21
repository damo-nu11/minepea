/**
 * Live Explore tabs against REAL captured /api/analytics payloads
 * (__fixtures__/, captured 2026-07-17). Guards the render path end-to-end —
 * including React key uniqueness, which live data broke once (duplicate-key
 * console errors on every tab).
 */

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineProvider } from "@/lib/engineContext";
import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
import type { EngineSnapshot, Store } from "@/lib/types";
import behaviour from "./__fixtures__/behaviour.json";
import buyback from "./__fixtures__/buyback.json";
import financials from "./__fixtures__/financials.json";
import mining from "./__fixtures__/mining.json";
import staking from "./__fixtures__/staking.json";
import token from "./__fixtures__/token.json";
import {
  LiveBuybacksTab,
  LiveHero,
  LiveMinersTab,
  LiveMiningCharts,
  LiveStakingTab,
  LiveTokenTab,
} from "./LiveTabs";

const TABS: Record<string, unknown> = {
  behaviour,
  buyback,
  financials,
  mining,
  staking,
  token,
};

let keyErrors: string[];

beforeEach(() => {
  keyErrors = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const tab = String(url).split("/").pop()!;
      const body = TABS[tab];
      if (!body) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  const orig = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("same key")) {
      keyErrors.push(args.map(String).join(" | "));
    }
    orig(...args);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Static store: LiveHero reads usePrices() through the engine seam. */
const SNAP: EngineSnapshot = {
  ...SERVER_SNAPSHOT,
  bootstrapped: true,
  prices: { peaUsd: 0, ethUsd: 0 },
};
const staticStore: Store<EngineSnapshot> = {
  subscribe: () => () => {},
  getSnapshot: () => SNAP,
  getServerSnapshot: () => SERVER_SNAPSHOT,
};

const CASES: [string, () => React.ReactElement][] = [
  ["LiveHero", () => <LiveHero />],
  ["LiveMiningCharts", () => <LiveMiningCharts />],
  ["LiveBuybacksTab", () => <LiveBuybacksTab />],
  ["LiveTokenTab", () => <LiveTokenTab />],
  ["LiveStakingTab", () => <LiveStakingTab />],
  ["LiveMinersTab", () => <LiveMinersTab />],
];

describe("Live Explore tabs render real payloads without duplicate keys", () => {
  for (const [name, make] of CASES) {
    it(name, async () => {
      const { container } = render(
        <EngineProvider store={staticStore}>{make()}</EngineProvider>,
      );
      // Wait for the fetched data to land and the charts to paint.
      await waitFor(() => {
        expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(keyErrors).toEqual([]);
    });
  }
});
