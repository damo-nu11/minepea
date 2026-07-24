/**
 * Peapot table freshness.
 *
 * The table showed 10 of the backend's 12 because the shared cache was
 * permanent: it loaded once per page and never looked again, so a peapot that
 * fired while the tab was open stayed invisible until a hard refresh. These
 * pins are about the REFETCH TRIGGER, which is the round advancing.
 *
 * The module holds cache state, so each test imports a fresh copy.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let currentRound: number | undefined = 100;

vi.mock("@/lib/hooks/useGame", () => ({
  useRound: () => ({
    data: currentRound === undefined ? undefined : { roundId: currentRound },
    status: "live" as const,
  }),
}));

/** Backend rows; tests push new peapots onto this between renders. */
let backend: { roundId: number }[] = [];
let fetchCount = 0;

function mockFetch() {
  fetchCount = 0;
  vi.stubGlobal("fetch", (url: string) => {
    if (!String(url).includes("peapot=true")) throw new Error("wrong endpoint");
    fetchCount += 1;
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          // Matches BackendRound in lib/api/translate exactly; a shape that
          // only looks close maps to empty rows and the test proves nothing.
          rounds: backend.map((r) => ({
            roundId: r.roundId,
            settled: true,
            settledAt: "2026-07-23T12:00:00.000Z",
            winningBlock: 1,
            isSplit: false,
            topMiner: "0x1111111111111111111111111111111111111111",
            peaWinner: "0x1111111111111111111111111111111111111111",
            peapotAmount: "1000000000000000000",
            totalDeployed: "1000000000000000000",
            totalWinnings: "900000000000000000",
            vaultedAmount: "100000000000000000",
            winnerCount: 1,
          })),
          pagination: { pages: 1, total: backend.length },
        }),
    });
  });
}

/** Renders the hook and prints the round ids it exposes. */
function Harness({ hook }: { hook: () => { data?: { roundId: number }[] } }) {
  const { data } = hook();
  return (
    <div data-testid="ids">{(data ?? []).map((r) => r.roundId).join(",")}</div>
  );
}

async function freshHook() {
  vi.resetModules();
  // The hook reads API_URL at module scope and no-ops without it (mock mode),
  // so it has to be set before the import or every test silently passes empty.
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
  const mod = await import("@/lib/hooks/usePeapotRounds");
  return mod.usePeapotRounds as unknown as () => {
    data?: { roundId: number }[];
  };
}

beforeEach(() => {
  currentRound = 100;
  backend = [{ roundId: 90 }, { roundId: 80 }];
  mockFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("usePeapotRounds", () => {
  it("loads the backend's rows, newest first", async () => {
    const hook = await freshHook();
    render(<Harness hook={hook} />);
    await waitFor(() =>
      expect(screen.getByTestId("ids").textContent).toBe("90,80"),
    );
  });

  it("picks up a peapot that fires while the page is open", async () => {
    // THE REGRESSION. A permanent cache leaves this at "90,80" forever.
    const hook = await freshHook();
    const { rerender } = render(<Harness hook={hook} />);
    await waitFor(() =>
      expect(screen.getByTestId("ids").textContent).toBe("90,80"),
    );

    // A round settles and drops a peapot.
    backend = [{ roundId: 101 }, { roundId: 90 }, { roundId: 80 }];
    currentRound = 102;
    rerender(<Harness hook={hook} />);

    await waitFor(() =>
      expect(screen.getByTestId("ids").textContent).toBe("101,90,80"),
    );
  });

  it("does not refetch when remounted on the same round", async () => {
    // What the shared cache is actually for. Tabbing away from Explore and
    // back remounts the component; without the cache that is a fresh scan
    // every time, and the effect's dependency array does not help because the
    // effect runs again on mount regardless.
    const hook = await freshHook();
    const first = render(<Harness hook={hook} />);
    await waitFor(() => expect(fetchCount).toBe(1));
    first.unmount();

    render(<Harness hook={hook} />);
    // Rows come straight from the cache, no second request.
    await waitFor(() =>
      expect(screen.getByTestId("ids").textContent).toBe("90,80"),
    );
    expect(fetchCount).toBe(1);
  });

  it("keeps the rows already shown when a refetch fails", async () => {
    const hook = await freshHook();
    const { rerender } = render(<Harness hook={hook} />);
    await waitFor(() =>
      expect(screen.getByTestId("ids").textContent).toBe("90,80"),
    );

    vi.stubGlobal("fetch", () => Promise.reject(new Error("network")));
    currentRound = 103;
    rerender(<Harness hook={hook} />);

    // Blanking a populated table on a transient failure is worse than stale.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId("ids").textContent).toBe("90,80");
  });
});
