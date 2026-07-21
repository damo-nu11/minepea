/**
 * Pins for the peapot announcement logic.
 *
 * Every failure here is silent in production: a wrong tile number reads as a
 * plausible announcement, a missed hit is indistinguishable from no hit, and
 * a NaN amount still posts. None of it throws, so nothing surfaces except a
 * wrong message in a public channel.
 */

import { describe, expect, it, vi } from "vitest";
import {
  peapotEmbed,
  peapotHits,
  postToWebhook,
  type SettledRoundLike,
} from "@/lib/server/peapotAlerts";

const PEA = (n: number) => String(BigInt(Math.round(n * 1e6)) * 10n ** 12n);

function round(over: Partial<SettledRoundLike> = {}): SettledRoundLike {
  return {
    roundId: 100,
    peapotAmount: "0",
    winningBlock: 0,
    peaWinner: "0x1111111111111111111111111111111111111111",
    winnerCount: 1,
    ...over,
  };
}

describe("peapotHits", () => {
  it("ignores rounds where the peapot did not drop", () => {
    expect(peapotHits([round(), round({ roundId: 101 })])).toEqual([]);
  });

  it("finds the rounds that did drop", () => {
    const hits = peapotHits([
      round({ roundId: 7, peapotAmount: PEA(42.5), winningBlock: 3 }),
      round({ roundId: 8 }),
      round({ roundId: 9, peapotAmount: PEA(1.25), winningBlock: 24 }),
    ]);
    expect(hits.map((h) => h.roundId)).toEqual([7, 9]);
    expect(hits[0].pea).toBeCloseTo(42.5, 6);
  });

  it("converts the tile to the 1-indexed number the site shows", () => {
    // The backend counts tiles from 0. Announcing the raw index names a
    // different tile than the board, on every single alert.
    const [first] = peapotHits([
      round({ peapotAmount: PEA(1), winningBlock: 0 }),
    ]);
    expect(first.tile).toBe(1);
    const [last] = peapotHits([
      round({ peapotAmount: PEA(1), winningBlock: 24 }),
    ]);
    expect(last.tile).toBe(25);
  });

  it("drops a non-zero amount it cannot parse rather than announcing NaN", () => {
    expect(peapotHits([round({ peapotAmount: "not-a-number" })])).toEqual([]);
  });

  it("carries the split case through instead of inventing a winner", () => {
    const [hit] = peapotHits([
      round({ peapotAmount: PEA(3), peaWinner: null, winnerCount: 12 }),
    ]);
    expect(hit.winner).toBeNull();
    expect(hit.winnerCount).toBe(12);
  });
});

describe("peapotEmbed", () => {
  const hit = {
    roundId: 512,
    pea: 30.921,
    tile: 17,
    winner: "0xAbCdEf0123456789012345678901234567890123",
    winnerCount: 1,
  };

  it("names the round and the tile", () => {
    const e = peapotEmbed(hit, 2.5, "2026-07-22T00:00:00.000Z");
    expect(e.title).toContain("#512");
    expect(e.description).toContain("#17");
  });

  it("prices the pot when a market price exists", () => {
    const e = peapotEmbed(hit, 2.5, "2026-07-22T00:00:00.000Z");
    const value = e.fields.find((f) => f.name === "Value");
    expect(value?.value).toBe("$77.30");
  });

  it("omits the value entirely when there is no market price", () => {
    // PEA had no pool for a while. "$0.00" in a public channel states a
    // valuation the protocol cannot know.
    for (const price of [null, 0]) {
      const e = peapotEmbed(hit, price, "2026-07-22T00:00:00.000Z");
      expect(e.fields.some((f) => f.name === "Value")).toBe(false);
      expect(JSON.stringify(e)).not.toContain("$0.00");
    }
  });

  it("says who won, or that it was split", () => {
    const solo = peapotEmbed(hit, 1, "2026-07-22T00:00:00.000Z");
    expect(solo.fields.find((f) => f.name === "Winner")?.value).toBe(
      "0xAbCd...0123",
    );
    const split = peapotEmbed(
      { ...hit, winner: null, winnerCount: 9 },
      1,
      "2026-07-22T00:00:00.000Z",
    );
    expect(split.fields.find((f) => f.name === "Winner")?.value).toBe(
      "Split across 9 miners",
    );
  });
});

describe("postToWebhook", () => {
  const embed = peapotEmbed(
    { roundId: 1, pea: 1, tile: 1, winner: null, winnerCount: 2 },
    1,
    "2026-07-22T00:00:00.000Z",
  );

  it("sends the embed in the shape Discord expects", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    await postToWebhook("https://discord.test/hook", embed);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://discord.test/hook");
    expect(JSON.parse(String(init.body))).toEqual({ embeds: [embed] });
    vi.unstubAllGlobals();
  });

  it("throws on a non-2xx so the caller can release its claim and retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => "rate limited",
      })) as unknown as typeof fetch,
    );
    await expect(
      postToWebhook("https://discord.test/hook", embed),
    ).rejects.toThrow(/429/);
    vi.unstubAllGlobals();
  });
});
