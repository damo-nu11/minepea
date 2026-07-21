import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LineChart } from "@/components/charts/LineChart";

const day = (n: number) => Date.UTC(2026, 6, n);

describe("LineChart unequal-length series", () => {
  it("hovering the right edge with a shorter later series", () => {
    // apr1d: 10 days. apr30d: only the last 3 days (leading nulls dropped).
    const long = Array.from({ length: 10 }, (_, i) => ({ t: day(i + 1), v: 5 + i }));
    const short = [7, 8, 9].map((i) => ({ t: day(i + 1), v: 2 + i }));
    const { container } = render(
      <LineChart
        series={[
          { name: "1D", color: "red", points: long },
          { name: "30D", color: "blue", points: short },
        ]}
        label="apr"
      />,
    );
    const svg = container.querySelector("svg")!;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 720, height: 240, right: 720, bottom: 240, x: 0, y: 0, toJSON() {} }) as DOMRect;
    // Pointer at the far right of the plot area.
    const { fireEvent } = require("@testing-library/react");
    fireEvent.pointerMove(svg, { clientX: 715, clientY: 100 });
    expect(screen.getByText(/5|14/)).toBeTruthy();
  });
});
