/**
 * Formatted-twin pins (Convention 2): components render these strings
 * verbatim, so a decimal-place choice here IS the on-screen number.
 */

import { describe, expect, it } from "vitest";
import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
import { toRoundVM } from "@/lib/mappers";
import { ethToWei } from "@/lib/mock/engine";

describe("toRoundVM", () => {
  it("formats DEPLOYED at 2dp (user 2026-07-25: 2.74, not 2.7)", () => {
    const vm = toRoundVM({
      ...SERVER_SNAPSHOT.round,
      totalDeployedWei: ethToWei(2.7415),
    });
    expect(vm.totalDeployedFormatted).toBe("2.74");
  });

  it("keeps trimming exact values rather than padding zeros", () => {
    // House style everywhere: 2.70 renders as 2.7, never a padded 2.70.
    const vm = toRoundVM({
      ...SERVER_SNAPSHOT.round,
      totalDeployedWei: ethToWei(2.7),
    });
    expect(vm.totalDeployedFormatted).toBe("2.7");
  });
});
