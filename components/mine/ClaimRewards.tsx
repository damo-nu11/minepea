"use client";

/**
 * Claimable rewards, surfaced under the Deploy CTA (user 2026-07-22).
 *
 * Claiming used to live only inside the profile drawer, which meant a miner
 * had to know to open it to discover they had won anything. This renders in
 * the deploy pane instead, and ONLY when there is something to claim, so it
 * costs nothing on the common path.
 *
 * PEA and ETH are separate on-chain calls, so they are separate buttons: one
 * "claim both" control would fire two wallet confirmations behind a single
 * label, which reads as a bug the second prompt appears.
 *
 * The guards mirror ProfilePanel deliberately. An uncheckpointed win reports
 * ZERO pending until checkpoint() runs, and the claim itself checkpoints, so
 * a round that has just been won must stay claimable while showing nothing.
 */

import { PeaIcon } from "@/components/icons";
import { useClaimTxs } from "@/lib/tx/hooks";
import { useRewards } from "@/lib/user/userData";

export function ClaimRewards() {
  const rewards = useRewards();
  const { claimEth, claimPea } = useClaimTxs();

  const r = rewards.data;
  const hasUncheckpointed = r?.uncheckpointedRound != null;
  const pendingEth = r?.pendingEth ?? 0;
  const netPea = r?.netPea ?? 0;

  // Nothing to show unless there is something to take. This is the whole
  // reason the block can live in the deploy pane without adding clutter.
  if (!r || (pendingEth <= 0 && netPea <= 0 && !hasUncheckpointed)) return null;

  const canClaimEth =
    !claimEth.pending && (pendingEth > 0 || hasUncheckpointed);
  const canClaimPea = !claimPea.pending && (netPea > 0 || hasUncheckpointed);

  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-[14px] border border-accent/25 bg-accent/[0.04] px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
          Rewards to claim
        </span>
        {hasUncheckpointed && (
          <span className="text-[11px] text-fg-muted">
            Round {r.uncheckpointedRound} pending
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <ClaimButton
          label="PEA"
          amount={r.netPeaFormatted}
          icon={<PeaIcon size={13} />}
          enabled={canClaimPea}
          pending={claimPea.pending}
          onClick={() => void claimPea.run().catch(() => {})}
        />
        <ClaimButton
          label="ETH"
          amount={r.pendingEthFormatted}
          icon={<span className="text-[12px] leading-none">Ξ</span>}
          enabled={canClaimEth}
          pending={claimEth.pending}
          onClick={() => void claimEth.run().catch(() => {})}
        />
      </div>

      <p className="text-[11px] leading-snug text-fg-muted">
        PEA pays out net of the 10% harvest fee. Claiming a fresh win
        checkpoints it first, so it takes two transactions.
      </p>
    </div>
  );
}

function ClaimButton({
  label,
  amount,
  icon,
  enabled,
  pending,
  onClick,
}: {
  label: string;
  amount: string;
  icon: React.ReactNode;
  enabled: boolean;
  pending: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      aria-label={`Claim ${amount} ${label}`}
      className={`focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-[11px] px-3 py-2.5 text-[13px] font-bold transition ${
        enabled
          ? "cursor-pointer bg-accent text-on-light hover:brightness-110"
          : "cursor-default bg-white/[0.05] text-fg-muted"
      }`}
    >
      {pending ? (
        "Claiming..."
      ) : (
        <>
          {icon}
          <span className="tnum">{amount}</span>
          <span className="opacity-70">{label}</span>
        </>
      )}
    </button>
  );
}
