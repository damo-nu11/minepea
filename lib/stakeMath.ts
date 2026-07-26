/**
 * Pure math for the staking projection calculator.
 *
 * Simple interest only, deliberately: staking yield does NOT auto-compound
 * (the user compounds manually), which is exactly why every label on the
 * site says APR and never APY (user decision 2026-07-17). A projection that
 * quietly compounded would overstate what holding still actually earns.
 */

export interface ProjectionWindow {
  label: string;
  days: number;
}

export const PROJECTION_WINDOWS: readonly ProjectionWindow[] = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "1Y", days: 365 },
];

/** PEA earned by `amountPea` at `aprPct` over `days`, simple interest. */
export function projectYield(
  amountPea: number,
  aprPct: number,
  days: number,
): number {
  if (
    !Number.isFinite(amountPea) ||
    !Number.isFinite(aprPct) ||
    !Number.isFinite(days)
  )
    return 0;
  if (amountPea <= 0 || aprPct <= 0 || days <= 0) return 0;
  return amountPea * (aprPct / 100) * (days / 365);
}
