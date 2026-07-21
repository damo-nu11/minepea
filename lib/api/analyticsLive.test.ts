import { describe, expect, it } from "vitest";
import {
  bucketRows,
  dayMs,
  seriesCumulative,
  seriesPoints,
  seriesPointsOpt,
  stat,
  tableRows,
  type AnalyticsEnvelope,
} from "./analyticsLive";

/** Shape mirrors real captured /api/analytics responses (2026-07-17). */
const ENV: AnalyticsEnvelope = {
  tab: "mining",
  generatedAt: "2026-07-17T11:00:00.000Z",
  series: {
    deployVolume: {
      unit: "eth",
      points: [
        { t: "2026-07-16", total: 0.0016, auto: 0.0004, manual: 0.0012 },
        { t: "2026-07-17", total: 0.0008, auto: 0, manual: 0.0008 },
      ],
    },
  },
  buckets: {
    blockPopularity: {
      unit: "count",
      rows: [{ blockId: 0, deploys: 10, deploys_excl_fullgrid: 2, eth: 0.0001 }],
    },
  },
  stats: {
    totalEthDeployed: { unit: "eth", value: 0.0026 },
    peaPriceEth: { unit: "eth", value: null },
  },
  tables: {
    topMiners: [
      {
        rank: 1,
        address: "0x72786c9a06547dd763f669cb22820e629f266c1f",
        totalDeployedEth: 0.0024,
      },
    ],
  },
};

describe("analyticsLive accessors", () => {
  it("converts day strings to UTC-midnight epoch ms", () => {
    expect(dayMs("2026-07-17")).toBe(Date.parse("2026-07-17T00:00:00Z"));
    expect(dayMs("garbage")).toBe(0);
  });

  it("extracts a numeric series field as chart points", () => {
    const pts = seriesPoints(ENV, "deployVolume", "total");
    expect(pts).toHaveLength(2);
    expect(pts[1]).toEqual({ t: dayMs("2026-07-17"), v: 0.0008 });
    // Missing series/field/env are all empty, never a throw.
    expect(seriesPoints(ENV, "nope", "total")).toEqual([]);
    expect(seriesPoints(ENV, "deployVolume", "nope").map((p) => p.v)).toEqual([
      0, 0,
    ]);
    expect(seriesPoints(undefined, "deployVolume", "total")).toEqual([]);
  });

  it("seriesPointsOpt skips null rates instead of coercing to 0 (APR gap rule)", () => {
    const env: AnalyticsEnvelope = {
      ...ENV,
      series: {
        roasting: {
          unit: "mixed",
          points: [
            { t: "2026-07-15", apr7d: null },
            { t: "2026-07-16", apr7d: 12.5 },
            { t: "2026-07-17", apr7d: 0 },
          ],
        },
      },
    };
    expect(seriesPointsOpt(env, "roasting", "apr7d").map((p) => p.v)).toEqual([
      12.5, 0, // null skipped; a REAL zero stays
    ]);
    expect(seriesPoints(env, "roasting", "apr7d").map((p) => p.v)).toEqual([
      0, 12.5, 0, // the coercing variant, for contrast
    ]);
  });

  it("accumulates a cumulative series", () => {
    const cum = seriesCumulative(ENV, "deployVolume", "auto");
    expect(cum.map((p) => p.v)).toEqual([0.0004, 0.0004]);
  });

  it("reads stats with null-signal passthrough", () => {
    expect(stat(ENV, "totalEthDeployed")).toBe(0.0026);
    expect(stat(ENV, "peaPriceEth")).toBeNull(); // null until price feed
    expect(stat(ENV, "missing")).toBeNull();
    expect(stat(undefined, "totalEthDeployed")).toBeNull();
  });

  it("reads buckets and tables defensively", () => {
    expect(bucketRows(ENV, "blockPopularity")).toHaveLength(1);
    expect(bucketRows(ENV, "missing")).toEqual([]);
    expect(tableRows(ENV, "topMiners")).toHaveLength(1);
    expect(tableRows(undefined, "topMiners")).toEqual([]);
  });
});
