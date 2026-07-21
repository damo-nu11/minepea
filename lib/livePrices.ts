/**
 * Live ETH/USD price store (user request 2026-07-12) — the shell's first
 * real external data. Polls Coinbase's public spot endpoint (CORS-open, no
 * key) every 30s and exposes the price through the same Store seam as
 * everything else. `usePrices` overlays it on the engine's simulated feed:
 * ETH becomes real, PEA stays simulated (no real market exists yet).
 *
 * - No module-scope side effects: polling lazy-starts on first subscribe
 *   and stops on last unsubscribe (Convention 7).
 * - getSnapshot returns a primitive (number | null) — inherently stable.
 * - null until the first fetch resolves (or on failure) → callers fall
 *   back to the simulated price, so the UI never blanks.
 * - Inert under vitest (no network in tests).
 */

const SPOT_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";
const POLL_MS = 30_000;

type Listener = () => void;

class LiveEthPriceStore {
  private listeners = new Set<Listener>();
  private price: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    if (!this.timer && process.env.NODE_ENV !== "test") {
      void this.poll();
      this.timer = setInterval(() => void this.poll(), POLL_MS);
    }
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  getSnapshot = (): number | null => this.price;
  getServerSnapshot = (): number | null => null;

  private async poll() {
    try {
      const res = await fetch(SPOT_URL);
      if (!res.ok) return; // keep last known price
      const body = (await res.json()) as { data?: { amount?: string } };
      const amount = Number(body.data?.amount);
      if (Number.isFinite(amount) && amount > 0 && amount !== this.price) {
        this.price = amount;
        for (const cb of this.listeners) cb();
      }
    } catch {
      // Network hiccup — keep the last known (or simulated fallback).
    }
  }
}

export const liveEthPrice = new LiveEthPriceStore();

/**
 * Live PEA/USD, read from our own cached /api/price-chart (GeckoTerminal spot
 * for the pool behind the Explore chart).
 *
 * It deliberately shares the chart's single source. The alternative, giving
 * the rail its own price feed, is how a page ends up quoting one number beside
 * a chart drawn from another.
 *
 * Polls our origin, not GeckoTerminal: the route is cached for 5 minutes, so
 * this costs nothing upstream no matter how many tabs are open. It asks for
 * the compact payload because the header is in the root layout, so the full
 * OHLCV series would be re-downloaded on every page, in every tab, once a
 * minute, to read a single number.
 */
class LivePeaPriceStore {
  private listeners = new Set<Listener>();
  private price: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    if (!this.timer && process.env.NODE_ENV !== "test") {
      void this.poll();
      this.timer = setInterval(() => void this.poll(), PEA_POLL_MS);
    }
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  getSnapshot = (): number | null => this.price;
  getServerSnapshot = (): number | null => null;

  private async poll() {
    try {
      const res = await fetch("/api/price-chart?compact=1");
      if (!res.ok) return; // keep last known price
      const body = (await res.json()) as { priceUsd?: number | null };
      const p = Number(body.priceUsd);
      if (Number.isFinite(p) && p > 0 && p !== this.price) {
        this.price = p;
        for (const cb of this.listeners) cb();
      }
    } catch {
      // Network hiccup — keep the last known (or simulated fallback).
    }
  }
}

/** The route caches for 5 min; polling faster only burns our own bandwidth. */
const PEA_POLL_MS = 60_000;

export const livePeaPrice = new LivePeaPriceStore();
