/**
 * Pins for the strict-endpoint scheduler behind Staked / rewards / AutoMiner.
 *
 * Two live failures drove these (2026-07-26):
 * - the in-flight guard was keyed by KIND alone, so after a wallet switch
 *   the new wallet's fetch silently no-oped while the old one's was still
 *   in the air, and nothing ever re-asked: Staked stayed blank until an
 *   unrelated SSE reconnect;
 * - a 429 was retried after a flat 61s while the server's own Retry-After
 *   header asked for 1-3s, stretching a pool blip into minutes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "@/lib/types";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

/** Deferred fetch double: resolve/reject each call by hand. */
function fetchDouble() {
  const calls: {
    url: string;
    resolve(res: unknown): void;
    reject(e: unknown): void;
  }[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    return new Promise((resolve, reject) => {
      calls.push({ url: String(url), resolve, reject });
    });
  });
  return calls;
}

const ok = (body: unknown) => ({
  status: 200,
  ok: true,
  json: async () => body,
});
const tooMany = (retryAfter: string | null) => ({
  status: 429,
  ok: false,
  headers: {
    get: (h: string) => (h.toLowerCase() === "retry-after" ? retryAfter : null),
  },
});

async function loadModule() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
  return await import("@/lib/user/userData");
}

function makeCtx(addr: Address) {
  return {
    addrRef: { current: addr as Address | null },
    inflight: new Set<string>(),
    lastFetch: new Map<string, number>(),
    trailing: new Map<string, ReturnType<typeof setTimeout>>(),
    signal: () => undefined,
    apply: vi.fn(),
    markError: vi.fn(),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("runStrictFetch keying", () => {
  it("a wallet switch fetches for the new wallet even while the old one's request is still in flight", async () => {
    // THE silent-drop regression: kind-only keying returned early here.
    const { runStrictFetch } = await loadModule();
    const calls = fetchDouble();
    const ctx = makeCtx(A);

    runStrictFetch("staking", ctx);
    expect(calls).toHaveLength(1); // A's, deliberately left unresolved

    ctx.addrRef.current = B;
    runStrictFetch("staking", ctx);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain(`/api/staking/${B}`);
  });

  it("still dedupes a second call for the SAME wallet and kind", async () => {
    const { runStrictFetch } = await loadModule();
    const calls = fetchDouble();
    const ctx = makeCtx(A);

    runStrictFetch("staking", ctx);
    runStrictFetch("staking", ctx);
    expect(calls).toHaveLength(1);
  });
});

describe("success path", () => {
  it("applies the body for the address the fetch was issued for, then frees the slot", async () => {
    const { runStrictFetch } = await loadModule();
    const calls = fetchDouble();
    const ctx = makeCtx(A);

    runStrictFetch("staking", ctx);
    calls[0].resolve(ok({ balance: "1" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.apply).toHaveBeenCalledWith("staking", A, { balance: "1" });
    expect(ctx.inflight.size).toBe(0);
  });
});

describe("429 handling", () => {
  it("retries when the server says to, not a minute later", async () => {
    const { runStrictFetch } = await loadModule();
    const calls = fetchDouble();
    const ctx = makeCtx(A);

    runStrictFetch("staking", ctx);
    calls[0].resolve(tooMany("2"));
    await vi.advanceTimersByTimeAsync(0);

    // Not yet at 2s...
    await vi.advanceTimersByTimeAsync(1_900);
    expect(calls).toHaveLength(1);
    // ...retried just past the server's window (2s + 250ms cushion).
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(2);
  });

  it("falls back to the old 61s only when the header is missing", async () => {
    const { runStrictFetch } = await loadModule();
    const calls = fetchDouble();
    const ctx = makeCtx(A);

    runStrictFetch("staking", ctx);
    calls[0].resolve(tooMany(null));
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(calls).toHaveLength(2);
  });
});

describe("strictRetryDelayMs", () => {
  it("converts the server's seconds and lands just after the window", async () => {
    const { strictRetryDelayMs } = await loadModule();
    expect(strictRetryDelayMs("2")).toBe(2_250);
    expect(strictRetryDelayMs("1")).toBe(1_250);
    expect(strictRetryDelayMs("1.5")).toBe(2_250); // ceil, never early
  });

  it("caps a hostile header and falls back on garbage", async () => {
    const { strictRetryDelayMs } = await loadModule();
    expect(strictRetryDelayMs("99999")).toBe(61_000);
    expect(strictRetryDelayMs(null)).toBe(61_000);
    expect(strictRetryDelayMs("soon")).toBe(61_000);
    expect(strictRetryDelayMs("-3")).toBe(61_000);
  });
});

describe("abort semantics", () => {
  it("an aborted fetch is a departure, not an error", async () => {
    const { runStrictFetch } = await loadModule();
    const calls = fetchDouble();
    const ctx = makeCtx(A);

    runStrictFetch("staking", ctx);
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    calls[0].reject(abortErr);
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.markError).not.toHaveBeenCalled();
    // The slot is freed, so the next identity's fetch is not blocked.
    expect(ctx.inflight.size).toBe(0);
  });

  it("a real failure still reports", async () => {
    const { runStrictFetch } = await loadModule();
    const calls = fetchDouble();
    const ctx = makeCtx(A);

    runStrictFetch("staking", ctx);
    calls[0].reject(new Error("network down"));
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.markError).toHaveBeenCalledWith("staking", A);
  });
});
