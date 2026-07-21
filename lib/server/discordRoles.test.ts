/**
 * Pins the role thresholds: defaults (1 / 100 PEA) and the env overrides.
 * The on-chain read + Discord REST are integration surfaces verified live.
 */

import { afterEach, describe, expect, it } from "vitest";
import { rolesFor, thresholds } from "@/lib/server/discordRoles";

afterEach(() => {
  delete process.env.PEA_HOLDER_MIN;
  delete process.env.PEA_WHALE_MIN;
});

describe("discord role thresholds", () => {
  it("defaults: 0.1 PEA holds, 25 PEA whales, boundaries inclusive", () => {
    expect(thresholds()).toEqual({ holder: 0.1, whale: 25 });
    expect(rolesFor(0)).toEqual({ holder: false, whale: false });
    expect(rolesFor(0.099)).toEqual({ holder: false, whale: false });
    expect(rolesFor(0.1)).toEqual({ holder: true, whale: false });
    expect(rolesFor(24.99)).toEqual({ holder: true, whale: false });
    expect(rolesFor(25)).toEqual({ holder: true, whale: true });
  });

  it("env overrides move both thresholds without code changes", () => {
    process.env.PEA_HOLDER_MIN = "5";
    process.env.PEA_WHALE_MIN = "1000";
    expect(rolesFor(4)).toEqual({ holder: false, whale: false });
    expect(rolesFor(5)).toEqual({ holder: true, whale: false });
    expect(rolesFor(999)).toEqual({ holder: true, whale: false });
    expect(rolesFor(1000)).toEqual({ holder: true, whale: true });
  });
});
