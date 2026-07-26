"use client";

/**
 * As-you-type yield projection under the deposit input (plan 2026-07-26).
 *
 * Projects the typed amount, or the user's current stake when the field is
 * empty, across selectable windows at the CURRENT 7-day-average APR. Simple
 * interest, per the site-wide APR-not-APY rule. The card stays visible on
 * the deposit tab even before a wallet or an amount exists (user
 * 2026-07-26): the audience for a calculator is the visitor who has not
 * staked yet, so an empty field prompts for an amount rather than hiding
 * the card.
 *
 * The card hosts its OWN amount field (user 2026-07-26: "enter an amount
 * into the calculator" must mean typing right here, not hunting for the
 * numeral at the top of the page). It edits the SAME state as the main
 * deposit input, so the calculator, the giant numeral and the CTA can
 * never disagree about the amount.
 *
 * Honesty rules (house style): a loading APR renders dashes, never a
 * confident zero; the USD line requires a real PEA price (the empty
 * snapshot carries 0, which must not print as "$0.00").
 */

import { useState } from "react";
import { PeaIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { AMOUNT_RE } from "@/components/mine/AmountBlock";
import { fmtToken, fmtUsd } from "@/lib/format";
import { PROJECTION_WINDOWS, projectYield } from "@/lib/stakeMath";

export function StakeProjection({
  amount,
  onAmountChange,
  amountPea,
  aprPct,
  peaUsd,
}: {
  /** Raw amount string, shared with the page's main deposit input. */
  amount: string;
  /** Editor for the shared amount (the card's own field drives it). */
  onAmountChange(next: string): void;
  /** Amount being projected (typed amount, else current stake). */
  amountPea: number;
  /** Current APR in percent, or null while unknown. */
  aprPct: number | null;
  /** Live PEA price; 0 means no market yet. */
  peaUsd: number;
}) {
  const [days, setDays] = useState(30);

  const hasAmount = amountPea > 0;
  const pea =
    hasAmount && aprPct !== null ? projectYield(amountPea, aprPct, days) : null;
  const usd = pea !== null && peaUsd > 0 ? pea * peaUsd : null;

  return (
    <div className="mt-6 rounded-[14px] border border-line-slate bg-white/[0.02] px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <Tooltip content="Projected earnings for the amount above at the current 7-day average APR, which moves constantly. Simple interest: yield does not compound unless you compound it.">
          <span className="micro-label dashed-underline transition-colors hover:text-fg">
            Projected yield
          </span>
        </Tooltip>
        <div
          className="flex gap-1.5"
          role="group"
          aria-label="Projection window"
        >
          {PROJECTION_WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              aria-pressed={days === w.days}
              onClick={() => setDays(w.days)}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                days === w.days
                  ? "bg-accent/[0.12] text-accent"
                  : "bg-white/[0.03] text-fg-muted hover:text-fg"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
      {/* The card's own field. Same mask and zero-handling as AmountBlock,
          bound to the same state, so typing in either place is equivalent. */}
      <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-line-slate bg-black/40 px-3.5 py-2.5 transition-colors focus-within:border-accent/60">
        <input
          type="text"
          inputMode="decimal"
          aria-label="Amount to project"
          value={amount}
          placeholder="0"
          onChange={(e) => {
            const next = e.target.value;
            if (next === "" || AMOUNT_RE.test(next)) onAmountChange(next);
          }}
          onFocus={(e) => {
            if (e.target.value === "0") onAmountChange("");
          }}
          onBlur={(e) => {
            if (e.target.value === "") onAmountChange("0");
          }}
          className="tnum min-w-0 flex-1 bg-transparent text-[15px] font-bold text-fg outline-none placeholder:text-fg-disabled"
        />
        <span className="micro-label">PEA</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="flex items-center gap-2">
          <PeaIcon size={15} />
          <span className="tnum text-[17px] font-bold text-fg">
            {pea === null ? "—" : `+${fmtToken(pea, 3)}`}
          </span>
        </span>
        <span className="tnum text-[13px] text-fg-muted">
          {!hasAmount
            ? "Enter an amount"
            : usd === null
              ? "—"
              : `≈${fmtUsd(usd)}`}
        </span>
      </div>
    </div>
  );
}
