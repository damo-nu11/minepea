/**
 * Pins for the announcement surface: the embed and the webhook post.
 * Hit DETECTION pins live in peapotChain.test.ts with the chain reader.
 *
 * Every failure here is silent in production: a wrong tile number reads as a
 * plausible announcement and nothing throws, so nothing surfaces except a
 * wrong message in a public channel.
 */

import { describe, expect, it, vi } from "vitest";
import { peapotEmbed, postToWebhook } from "@/lib/server/peapotAlerts";

describe("peapotEmbed", () => {
  const hit = { roundId: 512, pea: 30.921, tile: 17, settledAtMs: 0 };

  it("names the round and the tile", () => {
    const e = peapotEmbed(hit, 2.5, "2026-07-22T00:00:00.000Z");
    expect(e.title).toContain("#512");
    expect(e.description).toContain("#17");
  });

  it("prices the pot when a market price exists", () => {
    const e = peapotEmbed(hit, 2.5, "2026-07-22T00:00:00.000Z");
    const value = e.fields.find((f) => f.name.includes("USD Value"));
    expect(value?.value).toBe("~$77.30");
  });

  it("names no winner, because the peapot always splits", () => {
    const e = peapotEmbed(hit, 2.5, "2026-07-22T00:00:00.000Z");
    expect(JSON.stringify(e)).not.toMatch(/winner/i);
  });

  it("uses no em or en dashes in copy that reaches a channel", () => {
    const e = peapotEmbed(hit, 2.5, "2026-07-22T00:00:00.000Z");
    expect(JSON.stringify(e)).not.toMatch(/[—–]/);
  });

  it("omits the value entirely when there is no market price", () => {
    // PEA had no pool for a while. "$0.00" in a public channel states a
    // valuation the protocol cannot know.
    for (const price of [null, 0]) {
      const e = peapotEmbed(hit, price, "2026-07-22T00:00:00.000Z");
      expect(e.fields.some((f) => f.name.includes("USD Value"))).toBe(false);
      expect(JSON.stringify(e)).not.toContain("$0.00");
    }
  });
});

describe("postToWebhook", () => {
  const embed = peapotEmbed(
    { roundId: 1, pea: 1, tile: 1, settledAtMs: 0 },
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
