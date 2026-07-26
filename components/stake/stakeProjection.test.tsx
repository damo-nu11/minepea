/**
 * Projection card pins: exact arithmetic through the render, the honesty
 * gates (loading APR and missing market never print zeros), and the
 * always-visible empty state (the card must greet a visitor who has not
 * connected or typed yet). Plus page-level wiring pins through the REAL
 * StakePage: typing with no wallet drives the card, and the card sits
 * below the deposit CTA (user 2026-07-26).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StakePage } from "@/components/stake/StakePage";
import { EngineProvider } from "@/lib/engineContext";
import { fmtToken } from "@/lib/format";
import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
import { ANALYTICS } from "@/lib/mock/analytics";
import { projectYield } from "@/lib/stakeMath";
import type { EngineSnapshot, Store } from "@/lib/types";
import { WalletProvider } from "@/lib/wallet";
import { StakeProjection } from "./StakeProjection";

describe("StakeProjection", () => {
  it("projects the default 30-day window exactly, PEA and USD", () => {
    // 100 PEA at 36.5%: 1 PEA per 10 days => 3 PEA per 30 days => $6 at $2.
    render(<StakeProjection
        amount="100"
        onAmountChange={() => {}}
        amountPea={100}
        aprPct={36.5}
        peaUsd={2}
      />);
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("≈$6.00")).toBeInTheDocument();
  });

  it("switches windows through the chips", () => {
    render(<StakeProjection
        amount="100"
        onAmountChange={() => {}}
        amountPea={100}
        aprPct={36.5}
        peaUsd={2}
      />);
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(screen.getByText("+36.5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1D" }));
    expect(screen.getByText("+0.1")).toBeInTheDocument();
  });

  it("renders dashes while the APR is unknown, never a confident zero", () => {
    render(
      <StakeProjection
        amount="100"
        onAmountChange={() => {}}
        amountPea={100}
        aprPct={null}
        peaUsd={2}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/\+0/)).not.toBeInTheDocument();
  });

  it("gates the USD line on a real market price", () => {
    // peaUsd 0 is the empty snapshot, not a free token.
    render(
      <StakeProjection
        amount="100"
        onAmountChange={() => {}}
        amountPea={100}
        aprPct={36.5}
        peaUsd={0}
      />,
    );
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("stays visible with a prompt while there is nothing to project", () => {
    render(
      <StakeProjection
        amount="0"
        onAmountChange={() => {}}
        amountPea={0}
        aprPct={36.5}
        peaUsd={2}
      />,
    );
    expect(screen.getByText("Projected yield")).toBeInTheDocument();
    expect(screen.getByText("Enter an amount")).toBeInTheDocument();
    // The prompt is answerable IN PLACE: the card carries its own field.
    expect(screen.getByLabelText("Amount to project")).toBeEnabled();
    expect(screen.getByText("—")).toBeInTheDocument();
    // An empty field must prompt, never assert "+0" earnings.
    expect(screen.queryByText(/\+0/)).not.toBeInTheDocument();
  });
});

// ─── Page-level wiring (real StakePage, fixture store, stub wallet) ─────────

function renderStakePage() {
  const snapshot: EngineSnapshot = {
    ...SERVER_SNAPSHOT,
    bootstrapped: true,
    prices: { peaUsd: 12.4, ethUsd: 3800 },
  };
  const store: Store<EngineSnapshot> = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
  };
  return render(
    <EngineProvider store={store}>
      <WalletProvider>
        <StakePage />
      </WalletProvider>
    </EngineProvider>,
  );
}

describe("StakePage wiring", () => {
  it("typing an amount with NO wallet connected drives the card", () => {
    renderStakePage();
    const input = screen.getByLabelText("PEA to deposit");
    // The field itself must never be gated on a wallet: the calculator's
    // audience includes visitors who have not connected.
    expect(input).toBeEnabled();
    expect(input).not.toHaveAttribute("readonly");
    fireEvent.focus(input); // clears the "0" placeholder, like a real click
    fireEvent.change(input, { target: { value: "100" } });
    expect(input).toHaveValue("100");
    // The card recomputes from the SAME sources the page uses.
    const expected = `+${fmtToken(projectYield(100, ANALYTICS.impliedApyPct, 30), 3)}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("the deposit CTA renders ABOVE the projection card", () => {
    renderStakePage();
    const cta = screen.getByRole("button", { name: "Deposit" });
    const card = screen.getByText("Projected yield");
    expect(
      cta.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("typing in the card's own field drives the shared amount", () => {
    renderStakePage();
    const cardInput = screen.getByLabelText("Amount to project");
    fireEvent.focus(cardInput);
    fireEvent.change(cardInput, { target: { value: "50" } });
    // One state, two editors: the main deposit input follows the card...
    expect(cardInput).toHaveValue("50");
    expect(screen.getByLabelText("PEA to deposit")).toHaveValue("50");
    // ...and the projection recomputes from it.
    const expected = `+${fmtToken(projectYield(50, ANALYTICS.impliedApyPct, 30), 3)}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
