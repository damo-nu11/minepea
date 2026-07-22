import { describe, expect, it } from "vitest";
import {
  applyCheckpointed,
  checkpointHasReward,
  zeroClaimedEth,
  zeroClaimedPea,
  type RewardsVM,
} from "./userData";

const E18 = 10n ** 18n;

const BASE: RewardsVM = {
  pendingEthWei: "1476684000000000",
  pendingEth: 0.001476684,
  pendingEthFormatted: "0.001477",
  unrefinedPeaWei: (2n * E18).toString(),
  unrefinedPea: 2,
  unrefinedPeaFormatted: "2",
  refinedPeaWei: "0",
  refinedPea: 0,
  refinedPeaFormatted: "0",
  netPeaWei: ((2n * E18 * 9n) / 10n).toString(),
  netPea: 1.8,
  netPeaFormatted: "1.8",
  feePeaFormatted: "0.2",
  uncheckpointedRound: 13,
};

describe("optimistic rewards updates (SSE direct-apply)", () => {
  it("claimedETH zeroes pending ETH only", () => {
    const vm = zeroClaimedEth(BASE);
    expect(vm.pendingEthWei).toBe("0");
    expect(vm.pendingEthFormatted).toBe("0");
    expect(vm.netPeaFormatted).toBe("1.8"); // PEA untouched
  });

  it("claimedPEA zeroes the whole PEA position", () => {
    const vm = zeroClaimedPea(BASE);
    expect(vm.unrefinedPeaWei).toBe("0");
    expect(vm.refinedPeaWei).toBe("0");
    expect(vm.netPeaWei).toBe("0");
    expect(vm.netPeaFormatted).toBe("0");
    expect(vm.pendingEthFormatted).toBe("0.001477"); // ETH untouched
  });

  it("checkpointed adds rewards and recomputes the 10% refining fee", () => {
    const vm = applyCheckpointed(
      BASE,
      "1000000000000000", // +0.001 ETH
      E18.toString(), // +1 PEA
    );
    expect(vm.pendingEthWei).toBe("2476684000000000");
    expect(vm.unrefinedPeaWei).toBe((3n * E18).toString());
    // gross 3 → fee 0.3 → net 2.7
    expect(vm.netPeaFormatted).toBe("2.7");
    expect(vm.feePeaFormatted).toBe("0.3");
    expect(vm.uncheckpointedRound).toBeNull(); // just checkpointed
  });

  it("tolerates hex payload amounts (pre-fix backend dialect)", () => {
    const vm = applyCheckpointed(BASE, "0x38d7ea4c68000", "0x0"); // 0.001 ETH hex
    expect(vm.pendingEthWei).toBe("2476684000000000");
    expect(vm.unrefinedPeaWei).toBe(BASE.unrefinedPeaWei);
  });
});

describe("checkpointHasReward", () => {
  // A checkpoint with nothing on either leg used to announce "rewards are now
  // claimable" to miners who had won nothing, once per round.
  it("is false when both legs are zero, in either dialect", () => {
    expect(checkpointHasReward("0", "0")).toBe(false);
    expect(checkpointHasReward("0x0", "0x0")).toBe(false);
  });
  it("is true when either leg carries an amount", () => {
    expect(checkpointHasReward("1", "0")).toBe(true);
    expect(checkpointHasReward("0", E18.toString())).toBe(true);
    expect(checkpointHasReward("0x38d7ea4c68000", "0x0")).toBe(true);
  });
  it("treats missing or malformed amounts as nothing to claim", () => {
    // Never invent a reward out of a payload we could not read.
    expect(checkpointHasReward(undefined, null)).toBe(false);
    expect(checkpointHasReward("", "not-a-number")).toBe(false);
  });
});
