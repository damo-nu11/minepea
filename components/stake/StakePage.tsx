"use client";

/**
 * Stake page (ui-spec §5): centered ~640px column — H1, Deposit/Withdraw
 * toggle, amount block with PEA balance readout, percent chips, CTA
 * ladder, Summary (APR / Deposits / TVL). (Liquid pill removed 2026-07-13,
 * user decision: no liquid staking.)
 *
 * TWO variants behind the same layout (integration build 2026-07-16):
 * - StakePageSim (mock mode): the original local simulation — deposits move
 *   PEA between the fake wallet balance and a local staked position.
 * - StakePageLive (API mode): real position via useStakingPosition(), pool
 *   stats from GET /api/staking/stats (60s server cache), and on-chain txs —
 *   approve→deposit two-step (the Staking contract pulls PEA via
 *   transferFrom), withdraw, and a pending-yield claim row. Confirmations
 *   arrive via the per-user SSE (`stakeDeposited`/`stakeWithdrawn`).
 */

import { useCallback, useEffect, useState } from "react";
import { PeaIcon } from "@/components/icons";
import { ControlColumn, PageHeader } from "@/components/PageHeader";
import { Tooltip } from "@/components/Tooltip";
import { AmountBlock } from "@/components/mine/AmountBlock";
import { ChipRow } from "@/components/mine/controls";
import { IS_API_MODE } from "@/lib/engineContext";
import {
  fmtInt,
  fmtPct,
  fmtToken,
  fmtTokenFloor,
  fmtUsd,
  fromWei,
} from "@/lib/format";
import { usePrices } from "@/lib/hooks/useGame";
import { ANALYTICS } from "@/lib/mock/analytics";
import { ethToWei } from "@/lib/mock/engine";
import { useStakingTxs } from "@/lib/tx/hooks";
import { useStakingPosition, useStakingStatsTick } from "@/lib/user/userData";
import { useBalances, useWallet } from "@/lib/wallet";

// One source for the staking APR: Explore states the same metric on the
// same 7-day rolling basis, so a second hardcoded number contradicts it.
const MOCK_APR = ANALYTICS.impliedApyPct;
const MOCK_GLOBAL_DEPOSITS_PEA = 259_947;
const TX_DELAY_MS = 700;

type Tab = "deposit" | "withdraw";

export function StakePage() {
  return IS_API_MODE ? <StakePageLive /> : <StakePageSim />;
}

function StakePageSim() {
  const wallet = useWallet();
  const balances = useBalances();
  const prices = usePrices();

  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("0");
  const [stakedPea, setStakedPea] = useState(0);
  const [spentPea, setSpentPea] = useState(0); // deposited out of the wallet
  const [pending, setPending] = useState(false);

  const walletPea = Math.max(0, (balances.data?.pea ?? 0) - spentPea);
  const available = tab === "deposit" ? walletPea : stakedPea;
  const amountNum = parseFloat(amount) || 0;

  const canSubmit =
    wallet.status === "connected" &&
    !pending &&
    amountNum > 0 &&
    amountNum <= available;

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    await new Promise((r) => setTimeout(r, TX_DELAY_MS));
    // Withdrawals within a dust epsilon of the full position drain it exactly
    // — floored chip fills must never strand invisible, unreachable dust
    // (audit r2: 6dp inputs vs floored fills left ~1e-3 stuck forever).
    const effective =
      tab === "withdraw" && available - amountNum < 1e-6
        ? available
        : amountNum;
    if (tab === "deposit") {
      setStakedPea((s) => s + effective);
      setSpentPea((s) => s + effective);
    } else {
      setStakedPea((s) => Math.max(0, s - effective));
      setSpentPea((s) => Math.max(0, s - effective));
    }
    setAmount("0");
    setPending(false);
  };

  const setPercent = (pct: number) =>
    setAmount(fmtTokenFloor(available * pct, 6)); // floor at input precision (6dp)

  const globalDeposits = MOCK_GLOBAL_DEPOSITS_PEA + stakedPea;
  const tvlUsd = prices.data ? globalDeposits * prices.data.peaUsd : 0;

  const ctaLabel = pending
    ? tab === "deposit"
      ? "Depositing..."
      : "Withdrawing..."
    : amountNum > available && amountNum > 0
      ? "Insufficient balance"
      : tab === "deposit"
        ? "Deposit"
        : "Withdraw";

  return (
    <ControlColumn>
      <PageHeader
        title="Stake"
        subtitle="Put your PEA to work and earn yield."
      />

      {/* Deposit / Withdraw toggle */}
      <div className="mt-12 flex items-center justify-center gap-8">
        {(["deposit", "withdraw"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setAmount("0");
            }}
            className={`h-11 cursor-pointer rounded-full border-[1.5px] px-5 text-[15px] capitalize transition-colors ${
              tab === t
                ? "border-accent bg-surface-active font-bold text-fg shadow-[0_0_20px_-6px_var(--color-accent)]"
                : "border-transparent font-medium text-fg-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-8">
        <AmountBlock
          value={amount}
          onChange={setAmount}
          ariaLabel={`PEA to ${tab}`}
          below={
            <span className="flex items-center gap-2 text-[15px] text-fg-muted">
              <PeaIcon size={16} />
              <span className="tnum">
                {fmtToken(available, 2)} PEA{" "}
                {tab === "withdraw" ? "staked" : ""}
              </span>
            </span>
          }
        />
      </div>

      <div className="mt-6">
        <ChipRow
          chips={[
            { label: "25%", onClick: () => setPercent(0.25) },
            { label: "50%", onClick: () => setPercent(0.5) },
            { label: "75%", onClick: () => setPercent(0.75) },
            { label: "MAX", onClick: () => setPercent(1) },
          ]}
        />
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        className={`mt-5 h-[53px] w-full rounded-full text-[15px] font-semibold transition-colors ${
          canSubmit
            ? "cursor-pointer border-[1.5px] border-accent bg-transparent text-accent hover:bg-accent hover:text-on-light"
            : "bg-surface-deep text-fg-disabled"
        }`}
      >
        {ctaLabel}
      </button>

      {/* Summary */}
      <section className="mb-16 mt-24">
        <h2 className="font-wordmark text-[23px] font-bold tracking-[-0.01em] text-fg">
          Summary
        </h2>
        <dl className="mt-6 flex flex-col gap-7">
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Estimated yearly yield, based on a 7-day rolling average of protocol revenue.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  APR
                </span>
              </Tooltip>
            </dt>
            <dd className="tnum text-[17px] font-semibold text-fg">
              {fmtPct(MOCK_APR)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Total PEA deposited in the staking pool.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  Deposits
                </span>
              </Tooltip>
            </dt>
            <dd className="flex items-center gap-2">
              <PeaIcon size={16} className="text-fg" />
              <span className="tnum text-[17px] font-semibold text-fg">
                {fmtInt(globalDeposits)}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Total value locked, in USD at the current PEA price.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  TVL
                </span>
              </Tooltip>
            </dt>
            <dd className="tnum text-[17px] font-semibold text-fg">
              {fmtUsd(tvlUsd)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Your PEA currently staked in the pool.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  Staked
                </span>
              </Tooltip>
            </dt>
            <dd className="flex items-center gap-2">
              <PeaIcon size={16} className="text-fg" />
              <span className="tnum text-[17px] font-semibold text-fg">
                {fmtToken(stakedPea, 2)}
              </span>
            </dd>
          </div>
        </dl>
      </section>
    </ControlColumn>
  );
}

// ─── Live variant (API mode) ─────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface StakingStats {
  totalStaked: string;
  tvlUsd: string;
  /** Already a percentage string, e.g. "7.52". */
  apr: string;
}

function StakePageLive() {
  const wallet = useWallet();
  const balances = useBalances();
  const position = useStakingPosition();
  const { approve, deposit, withdraw, claimYield, compound, readAllowance } =
    useStakingTxs();

  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("0");
  /** Exact-wei intent from MAX on withdraw — drains the position without
   * float-roundtrip dust. Cleared the moment the user edits the field. */
  const [exactWei, setExactWei] = useState<string | null>(null);
  const [stats, setStats] = useState<StakingStats | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);

  // Pool stats — the backend refreshes this cache on stake/unstake webhooks
  // (backend 2026-07-17), so keying on the SSE tick makes the totals fresh
  // right after each action; the 60s poll covers OTHER users' moves.
  // (Deliberately /api/staking/stats, not the analytics staking tab — the
  // analytics endpoint has its own 60s response cache stacked on top.)
  const statsTick = useStakingStatsTick();
  useEffect(() => {
    let alive = true;
    const load = () =>
      void fetch(`${API_URL}/api/staking/stats`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: StakingStats | null) => {
          if (alive && body) setStats(body);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [statsTick]);

  const refreshAllowance = useCallback(() => {
    void readAllowance()
      .then(setAllowance)
      .catch(() => {});
  }, [readAllowance]);
  useEffect(() => {
    if (wallet.status === "connected") refreshAllowance();
  }, [wallet.status, refreshAllowance]);
  // A read from a previous session is meaningless once disconnected.
  const liveAllowance = wallet.status === "connected" ? allowance : null;

  const walletPea = balances.data?.pea ?? 0;
  const stakedPea = position.data?.staked ?? 0;
  const available = tab === "deposit" ? walletPea : stakedPea;
  const amountNum = parseFloat(amount) || 0;
  const amountWei = BigInt(exactWei ?? ethToWei(amountNum));

  const pending = approve.pending || deposit.pending || withdraw.pending;
  const insufficient = amountNum > available && amountNum > 0;
  const needsApproval =
    tab === "deposit" && liveAllowance !== null && amountWei > liveAllowance;
  const canSubmit =
    wallet.status === "connected" && !pending && amountNum > 0 && !insufficient;

  const setPercent = (pct: number) => {
    setAmount(fmtTokenFloor(available * pct, 6));
    // MAX withdraw drains the exact on-chain position, not the 6dp floor.
    setExactWei(
      pct === 1 && tab === "withdraw" && position.data
        ? position.data.stakedWei
        : null,
    );
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      if (tab === "deposit") {
        if (needsApproval) {
          await approve.run(amountWei);
          refreshAllowance();
          wallet.refreshBalances(); // gas moved the ETH side
          return; // CTA flips to "Deposit" once the allowance read lands
        }
        await deposit.run(amountWei);
        refreshAllowance(); // deposit consumed the allowance
        wallet.refreshBalances();
      } else {
        await withdraw.run(amountWei);
        wallet.refreshBalances();
      }
      setAmount("0");
      setExactWei(null);
    } catch {
      // Error toast already raised by the tx layer; state re-derives.
    }
  };

  const ctaLabel = pending
    ? approve.pending
      ? "Approving..."
      : tab === "deposit"
        ? "Depositing..."
        : "Withdrawing..."
    : insufficient
      ? "Insufficient balance"
      : tab === "deposit"
        ? needsApproval
          ? "Approve PEA"
          : "Deposit"
        : "Withdraw";

  const pendingYield = position.data?.pendingYield ?? 0;
  const yieldTxPending = claimYield.pending || compound.pending;
  const canClaimYield = !yieldTxPending && pendingYield > 0;

  return (
    <ControlColumn>
      <PageHeader
        title="Stake"
        subtitle="Put your PEA to work and earn yield."
      />

      {/* Deposit / Withdraw toggle */}
      <div className="mt-12 flex items-center justify-center gap-8">
        {(["deposit", "withdraw"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setAmount("0");
              setExactWei(null);
            }}
            className={`h-11 cursor-pointer rounded-full border-[1.5px] px-5 text-[15px] capitalize transition-colors ${
              tab === t
                ? "border-accent bg-surface-active font-bold text-fg shadow-[0_0_20px_-6px_var(--color-accent)]"
                : "border-transparent font-medium text-fg-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-8">
        <AmountBlock
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setExactWei(null);
          }}
          ariaLabel={`PEA to ${tab}`}
          below={
            <span className="flex items-center gap-2 text-[15px] text-fg-muted">
              <PeaIcon size={16} />
              <span className="tnum">
                {fmtToken(available, 2)} PEA{" "}
                {tab === "withdraw" ? "staked" : ""}
              </span>
            </span>
          }
        />
      </div>

      <div className="mt-6">
        <ChipRow
          chips={[
            { label: "25%", onClick: () => setPercent(0.25) },
            { label: "50%", onClick: () => setPercent(0.5) },
            { label: "75%", onClick: () => setPercent(0.75) },
            { label: "MAX", onClick: () => setPercent(1) },
          ]}
        />
      </div>

      <span aria-live="polite" className="sr-only">
        {ctaLabel}
      </span>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => void submit()}
        className={`mt-5 h-[53px] w-full rounded-full text-[15px] font-semibold transition-colors ${
          canSubmit
            ? "cursor-pointer border-[1.5px] border-accent bg-transparent text-accent hover:bg-accent hover:text-on-light"
            : "bg-surface-deep text-fg-disabled"
        }`}
      >
        {ctaLabel}
      </button>

      {/* Summary */}
      <section className="mb-16 mt-24">
        <h2 className="font-wordmark text-[23px] font-bold tracking-[-0.01em] text-fg">
          Summary
        </h2>
        <dl className="mt-6 flex flex-col gap-7">
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Estimated yearly yield, based on a 7-day rolling average of protocol revenue.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  APR
                </span>
              </Tooltip>
            </dt>
            <dd className="tnum text-[17px] font-semibold text-fg">
              {stats ? fmtPct(Number(stats.apr)) : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Total PEA deposited in the staking pool.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  Deposits
                </span>
              </Tooltip>
            </dt>
            <dd className="flex items-center gap-2">
              <PeaIcon size={16} className="text-fg" />
              <span className="tnum text-[17px] font-semibold text-fg">
                {stats ? fmtInt(fromWei(stats.totalStaked)) : "—"}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Total value locked, in USD at the current PEA price.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  TVL
                </span>
              </Tooltip>
            </dt>
            <dd className="tnum text-[17px] font-semibold text-fg">
              {stats && Number(stats.tvlUsd) > 0
                ? fmtUsd(Number(stats.tvlUsd))
                : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Your PEA currently staked in the pool.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  Staked
                </span>
              </Tooltip>
            </dt>
            <dd className="flex items-center gap-2">
              <PeaIcon size={16} className="text-fg" />
              <span className="tnum text-[17px] font-semibold text-fg">
                {position.data ? fmtToken(position.data.staked, 2) : "—"}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              <Tooltip content="Your share of the staking yield, claimable any time.">
                <span className="dashed-underline text-[14px] text-fg-muted">
                  Pending yield
                </span>
              </Tooltip>
            </dt>
            <dd className="flex items-center gap-2.5">
              <PeaIcon size={16} className="text-accent" />
              <span className="tnum text-[17px] font-semibold text-fg">
                {position.data?.pendingYieldFormatted ?? "—"}
              </span>
              <button
                type="button"
                disabled={!canClaimYield}
                onClick={() =>
                  void claimYield
                    .run()
                    .then(() => wallet.refreshBalances())
                    .catch(() => {})
                }
                className={`flex h-8 items-center rounded-full border-[1.5px] px-3 text-[13px] font-bold transition-colors ${
                  canClaimYield
                    ? "cursor-pointer border-accent text-accent hover:bg-accent hover:text-on-light"
                    : "border-line-slate text-fg-disabled"
                }`}
              >
                {claimYield.pending ? "Claiming..." : "Claim"}
              </button>
              {/* Compound restakes the yield in one tx — no wallet hop. */}
              <button
                type="button"
                disabled={!canClaimYield}
                onClick={() =>
                  void compound
                    .run()
                    .then(() => wallet.refreshBalances())
                    .catch(() => {})
                }
                className={`flex h-8 items-center rounded-full border-[1.5px] px-3 text-[13px] font-bold transition-colors ${
                  canClaimYield
                    ? "cursor-pointer border-accent text-accent hover:bg-accent hover:text-on-light"
                    : "border-line-slate text-fg-disabled"
                }`}
              >
                {compound.pending ? "Compounding..." : "Compound"}
              </button>
            </dd>
          </div>
        </dl>
      </section>
    </ControlColumn>
  );
}
