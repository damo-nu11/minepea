import { describe, expect, it } from "vitest";
import { fmtTokenSmart } from "./format";

describe("fmtTokenSmart", () => {
  it("keeps the design precision for normal amounts", () => {
    expect(fmtTokenSmart(12.5, 1)).toBe("12.5");
    expect(fmtTokenSmart(0.1, 3)).toBe("0.1");
    expect(fmtTokenSmart(0, 1)).toBe("0");
  });

  it("never renders a nonzero amount as 0 (MIN_DEPLOY-scale, live 2026-07-17)", () => {
    expect(fmtTokenSmart(0.00003, 1)).toBe("0.00003");
    expect(fmtTokenSmart(0.00001, 3)).toBe("0.00001");
    expect(fmtTokenSmart(0.001347192, 4)).toBe("0.0013");
  });
});
import {
  fmtCompact,
  fmtCompactSig,
  fmtTokenFloor,
  fmtCountdown,
  fmtInt,
  fmtPct,
  fmtRoundId,
  fmtToken,
  fmtUsd,
  fromWei,
  relTime,
  shortAddr,
} from "@/lib/format";

describe("fromWei", () => {
  it("converts 18-dp wei strings", () => {
    expect(fromWei("1000000000000000000")).toBe(1);
    expect(fromWei("428000000000000000")).toBeCloseTo(0.428);
    expect(fromWei("0")).toBe(0);
  });
  it("returns 0 on garbage", () => {
    expect(fromWei("not-a-number")).toBe(0);
  });
});

describe("fmtToken", () => {
  it("trims trailing zeros up to dp", () => {
    expect(fmtToken(10.7023)).toBe("10.7023");
    expect(fmtToken(9.417)).toBe("9.417");
    expect(fmtToken(10.7)).toBe("10.7");
    expect(fmtToken(11)).toBe("11");
  });
  it("respects dp", () => {
    expect(fmtToken(0.123456, 3)).toBe("0.123");
    expect(fmtToken(111.6, 1)).toBe("111.6");
  });
  it("handles non-finite", () => {
    expect(fmtToken(NaN)).toBe("0");
  });
});

describe("fmtTokenFloor", () => {
  it("floors instead of rounding half-up (balance-derived inputs)", () => {
    expect(fmtTokenFloor(1249.437, 2)).toBe("1249.43");
    expect(fmtTokenFloor(0.567, 2)).toBe("0.56");
    expect(fmtTokenFloor(0.00009799, 4)).toBe("0");
  });
  it("clamps non-positive and non-finite to 0", () => {
    expect(fmtTokenFloor(0, 4)).toBe("0");
    expect(fmtTokenFloor(-3, 4)).toBe("0");
    expect(fmtTokenFloor(NaN, 4)).toBe("0");
  });
});

describe("fmtUsd", () => {
  it("formats with separators at 2dp", () => {
    expect(fmtUsd(90.6)).toBe("$90.60");
    expect(fmtUsd(23551423)).toBe("$23,551,423.00");
  });
  it("uses 4dp below $1", () => {
    expect(fmtUsd(0.0421)).toBe("$0.0421");
  });
});

describe("fmtInt", () => {
  it("floors and separates", () => {
    expect(fmtInt(3000000)).toBe("3,000,000");
    expect(fmtInt(475695.9)).toBe("475,695");
  });
});

describe("fmtCompact", () => {
  it("compacts K/M/B", () => {
    expect(fmtCompact(1234)).toBe("1.23K");
    expect(fmtCompact(23551423)).toBe("23.55M");
    expect(fmtCompact(2500000000)).toBe("2.5B");
    expect(fmtCompact(42)).toBe("42");
  });
});

describe("fmtCompactSig", () => {
  it("holds four significant figures across magnitudes", () => {
    expect(fmtCompactSig(243_800)).toBe("243.8K");
    expect(fmtCompactSig(1_183_000)).toBe("1.183M");
    expect(fmtCompactSig(12_345_678)).toBe("12.35M");
    expect(fmtCompactSig(1_000_000_000)).toBe("1.000B");
  });
  it("promotes the unit when rounding carries the mantissa to 1000", () => {
    // Naive fixed-decimal compaction renders this "1000.0K".
    expect(fmtCompactSig(999_999)).toBe("1.000M");
    expect(fmtCompactSig(999_499)).toBe("999.5K");
  });
  it("handles zero, negatives and non-finite input", () => {
    expect(fmtCompactSig(0)).toBe("0");
    expect(fmtCompactSig(-243_800)).toBe("-243.8K");
    expect(fmtCompactSig(Number.NaN)).toBe("0");
  });
});

describe("fmtPct", () => {
  it("formats with fixed dp", () => {
    expect(fmtPct(17.2)).toBe("17.20%");
    expect(fmtPct(9.5, 1)).toBe("9.5%");
  });
});

describe("fmtRoundId", () => {
  it("prefixes # with separators", () => {
    expect(fmtRoundId(328913)).toBe("#328,913");
  });
});

describe("fmtCountdown", () => {
  it("zero-pads MM:SS", () => {
    expect(fmtCountdown(0)).toBe("00:00");
    expect(fmtCountdown(59)).toBe("00:59");
    expect(fmtCountdown(60)).toBe("01:00");
    expect(fmtCountdown(605)).toBe("10:05");
  });
  it("clamps negatives", () => {
    expect(fmtCountdown(-4)).toBe("00:00");
  });
});

describe("relTime", () => {
  const now = 1_000_000_000_000;
  it("sec / min / hr / d ladder", () => {
    expect(relTime(now - 51_000, now)).toBe("51 sec ago");
    expect(relTime(now - 2 * 60_000, now)).toBe("2 min ago");
    expect(relTime(now - 3 * 3_600_000, now)).toBe("3 hr ago");
    expect(relTime(now - 2 * 86_400_000, now)).toBe("2 d ago");
  });
  it("clamps future to 0 sec", () => {
    expect(relTime(now + 5_000, now)).toBe("0 sec ago");
  });
});

describe("shortAddr", () => {
  it("keeps 0x + first 4 + last 4", () => {
    expect(shortAddr("0x1A2b334455667788990011223344556699F3e0")).toBe(
      "0x1A2b...F3e0",
    );
  });
});
