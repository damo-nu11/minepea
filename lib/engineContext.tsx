"use client";

/**
 * Game store context — provides a Store<EngineSnapshot> to the hook layer.
 * Hooks depend ONLY on the Store interface, so any implementation swaps in
 * with zero component diffs (the seam test in useGame.test.tsx proves it):
 * - default: the mock engine (deterministic local simulation)
 * - NEXT_PUBLIC_API_URL set: ApiGameStore (real backend, Phase 9)
 * - tests: any fixture store via the `store` prop
 */

import { createContext, useContext, useState } from "react";
import { ApiGameStore } from "@/lib/api/gameStore";
import { createEngine } from "@/lib/mock/engine";
import type { EngineSnapshot, GameActions, Store } from "@/lib/types";

/**
 * Shipped seed. Deliberately one whose 60-round seeded history CONTAINS
 * motherlode hits (seed 3 → 2) so the Motherlodes table is populated on a
 * fresh session — pinned by an engine test. Seed 42 had zero (audit finding).
 *
 * Re-picked 2026-07-17: the split flip moved 0.12 → 0.5 to match the stated
 * economics, which shifts every downstream draw; seed 7 fell to zero hits.
 * Any change to the engine's rng call sequence can do this again — if the
 * motherlode pin fails, rescan seeds rather than weakening the test.
 */
export const MOCK_SEED = 3;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** True when the app runs against the live backend (real data + on-chain
 * txs); false in the zero-credential mock/simulation mode. */
export const IS_API_MODE = !!API_URL;

const EngineContext = createContext<Store<EngineSnapshot> | null>(null);

export function EngineProvider({
  store,
  children,
}: {
  /** Inject a custom store (tests); otherwise env decides api vs mock. */
  store?: Store<EngineSnapshot>;
  children: React.ReactNode;
}) {
  // Lazy one-time construction; building is pure (no timers/IO until subscribe).
  const [engine] = useState<Store<EngineSnapshot>>(() => {
    if (store) return store;
    if (API_URL) return new ApiGameStore(API_URL);
    return createEngine({ seed: MOCK_SEED, now: () => Date.now() });
  });
  return (
    <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
  );
}

export function useEngineStore(): Store<EngineSnapshot> {
  const ctx = useContext(EngineContext);
  if (!ctx)
    throw new Error("useEngineStore must be used inside <EngineProvider>");
  return ctx;
}

/** The store's action surface. Null when the injected store exposes none. */
export function useEngineActions(): GameActions | null {
  const store = useEngineStore();
  const maybe = store as Partial<GameActions>;
  return typeof maybe.deploy === "function" ? (maybe as GameActions) : null;
}
