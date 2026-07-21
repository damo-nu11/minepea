"use client";

/**
 * Mine page (ui-spec §3) — the centerpiece. Two-pane layout: the board
 * pane left (flex-1, capped at min(920px, 100dvh - 160px); 560px below
 * lg, matching the rest of the column), controls sidebar right (480px).
 * The pane carries NO top offset while the sidebar carries lg:mt-4, so
 * the board deliberately sits ~16px above the sidebar's first card.
 * flows/scrolls naturally (no viewport-lock, user 2026-07-15) so the sidebar
 * never needs its own scrollbar; the MINERS feed is a fixed ~5-row panel that
 * scrolls inside itself.
 *
 * Deploy CTA ladder: disabled → enabled (connected + valid) → pending →
 * deployed/locked for the round. Settlement states render from round.phase
 * (Convention 3), never from timer === 0.
 * (Lite/Pro toggle removed 2026-07-12 — user decision; single full form.)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { useEngineStore } from "@/lib/engineContext";
import { WalletIcon } from "@/components/icons";
import { LastRoundBar } from "@/components/mine/LastRoundBar";
import { VineBoard } from "@/components/mine/VineBoard";
import { MinersFeed } from "@/components/mine/MinersFeed";
import { StatsStrip } from "@/components/mine/StatsStrip";
import { fmtToken, fmtTokenFloor, fromWei } from "@/lib/format";
import { useRound, useUserGameState } from "@/lib/hooks/useGame";
import { ethToWei } from "@/lib/mock/engine";
import {
  useAutoMinerQuote,
  useAutoMinerStop,
  useDeployAction,
} from "@/lib/tx/hooks";
import type { TileId } from "@/lib/types";
import { useAutomine } from "@/lib/user/userData";
import { useBalances, useWallet } from "@/lib/wallet";

/** Deploys are refused inside this window: a signature started here
 * can mine after the round rolls, and deploy() carries no round id. */
const DEPLOY_CUTOFF_MS = 8_000;

const ALL_TILES: TileId[] = Array.from({ length: 25 }, (_, i) => i);
/** Amount input mask: up to 4 integer + 6 decimal digits (matches AmountBlock). */
const AMOUNT_RE = /^\d{0,4}(\.\d{0,6})?$/;

export function MinePage() {
  const store = useEngineStore();
  const toast = useToast();
  const round = useRound();
  const user = useUserGameState();
  const wallet = useWallet();
  const balances = useBalances();
  // Routes mock → engine.deploy, API → GridMining.deploy (1 round) or
  // AutoMiner.setConfig (multi-round prepaid).
  const deployAction = useDeployAction();
  const automine = useAutomine();
  const stopAutomine = useAutoMinerStop();

  const [selected, setSelected] = useState<Set<TileId>>(new Set());
  const [amount, setAmount] = useState("0");
  const [rounds, setRounds] = useState(1);
  const [deploying, setDeploying] = useState(false);
  // Local lock latch: the mock engine updates user.deployedRound
  // synchronously before deploy() resolves, but a real backend confirms it
  // asynchronously via a later SSE `user` event. Without this latch the
  // grid+CTA would unlock during confirmation latency and allow a
  // double-deploy the backend then rejects (audit). Superseded once the
  // round rolls (it only matches the current roundId).
  const [deployedRoundId, setDeployedRoundId] = useState<number | null>(null);
  // The tiles we just submitted: shown as deployed IMMEDIATELY so the
  // board never goes dark between the deploy resolving (selection
  // clears) and the backend's user event confirming the tiles.
  const [deployedTilesLocal, setDeployedTilesLocal] = useState<TileId[]>([]);

  // Clear selection when a new round opens (unless the engine auto-deployed).
  const lastRoundId = useRef<number | null>(null);
  useEffect(() => {
    if (!round.data) return;
    if (
      lastRoundId.current !== null &&
      round.data.roundId !== lastRoundId.current
    ) {
      setSelected(new Set());
      // AutoMiner continuity: while a multi-round config is live, carry
      // the deploy latch into the fresh round so the board stays lit and
      // locked through backend confirmation latency; the user event
      // reconciles the truth when it lands.
      if (automine.data?.active) {
        setDeployedRoundId(round.data.roundId);
      }
    }
    lastRoundId.current = round.data.roundId;
  }, [round.data, automine.data?.active]);

  // [wallet switch] The deploy latch belongs to the wallet that made it:
  // a mid-round account change must not show the previous wallet's
  // deploy or lock the new wallet out.
  const latchAddress = useRef<string | null>(null);
  useEffect(() => {
    if (
      latchAddress.current !== null &&
      latchAddress.current !== wallet.address
    ) {
      setDeployedRoundId(null);
      setDeployedTilesLocal([]);
    }
    latchAddress.current = wallet.address;
  }, [wallet.address]);

  const hasDeployed =
    !!round.data &&
    // Confirmed by the store's user slice, OR locally latched since we
    // submitted this round (bridges async-backend confirmation latency).
    ((!!user.data && user.data.deployedRound === round.data.roundId) ||
      deployedRoundId === round.data.roundId);

  // What the boards show as deployed: the backend's confirmed tiles for
  // this round, or the locally latched submission while confirmation is
  // in flight — identical treatment either way, no dark gap.
  const deployedTilesShown: TileId[] =
    user.data && round.data && user.data.deployedRound === round.data.roundId
      ? user.data.deployedTiles
      : deployedRoundId === round.data?.roundId
        ? deployedTilesLocal
        : [];

  const active = round.data?.phase === "active";
  const interactive = active && !hasDeployed && !deploying;

  const toggleTile = useCallback((id: TileId, forceOp?: "add" | "remove") => {
    setSelected((prev) => {
      const next = new Set(prev);
      const op = forceOp ?? (next.has(id) ? "remove" : "add");
      if (op === "add") next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Stepper semantics: + adds the lowest unselected tile, − removes the
  // highest selected one; ALL selects the whole grid.
  const stepTiles = (dir: 1 | -1) => {
    if (!interactive) return; // selection is locked while deployed/settling
    setSelected((prev) => {
      const next = new Set(prev);
      if (dir === 1) {
        const free = ALL_TILES.find((t) => !next.has(t));
        if (free !== undefined) next.add(free);
      } else {
        const picked = [...next].sort((a, b) => b - a)[0];
        if (picked !== undefined) next.delete(picked);
      }
      return next;
    });
  };

  const amountNum = parseFloat(amount) || 0;
  const tileCount = selected.size;
  // Executor-fee/deposit disclosure for the multi-round (AutoMiner) path.
  const quote = useAutoMinerQuote(ethToWei(amountNum), tileCount, rounds);
  const perRound = amountNum * tileCount;
  const total = perRound * rounds;
  const balance = balances.data?.eth ?? 0;
  // A balance we do not have yet is NOT a balance of zero. Collapsing the
  // two turned a transient RPC failure into a permanent "Insufficient
  // funds" that the user could do nothing about.
  const balanceKnown = balances.status === "live";
  // Multi-round arms the AutoMiner, which takes an executor fee ON TOP of
  // the stake. Charging affordability against the stake alone let a user
  // commit to more than they hold.
  const committed =
    rounds > 1 && quote ? fromWei(quote.deposit.toString()) : total;
  const exceedsBalance = balanceKnown && committed > balance;

  // deploy() takes only tile ids — nothing binds it to a round. A
  // signature started in the closing seconds can mine into the NEXT
  // round, against different tile weights, and the user would never know.
  // Close the window while they still have time to see why.
  const msLeft =
    (round.data?.endsAt ?? 0) - (store.serverNow?.() ?? Date.now());
  const roundClosing = active && msLeft > 0 && msLeft < DEPLOY_CUTOFF_MS;

  // Never let funds be committed against a board the app knows is stale.
  const dataStale = round.status === "error" && round.data !== undefined;

  const canDeploy =
    wallet.status === "connected" &&
    balanceKnown &&
    !dataStale &&
    deployAction.available &&
    active &&
    !roundClosing &&
    !hasDeployed &&
    !deploying &&
    amountNum > 0 &&
    tileCount > 0 &&
    !exceedsBalance;

  // Always the live round, readable after an await (state would be stale).
  const liveRoundRef = useRef<number | null>(null);
  liveRoundRef.current = round.data?.roundId ?? null;

  const deploy = async () => {
    if (!canDeploy || !wallet.address) return;
    const deployedFor = round.data?.roundId ?? null;
    setDeploying(true);
    try {
      const outcome = await deployAction.deploy({
        miner: wallet.address,
        amountPerTileWei: ethToWei(amountNum),
        tiles: [...selected],
        rounds,
      });
      // Latch to the round we submitted for — but only if that is still
      // the live round. If it rolled while they were signing, the deploy
      // belongs to a round this board is no longer showing, and claiming
      // otherwise would light tiles the user does not actually hold.
      // Only refreshBalances() re-reads the chain under Privy; without
      // this the wallet figure stays stale after spending.
      wallet.refreshBalances();
      // Arming the AutoMiner stakes NOTHING in the round on screen — the
      // executor deploys on later ones — so the board must not lock or
      // light tiles here. The lock arrives with the executor's own deploy.
      if (outcome === "armed") {
        setSelected(new Set());
        return;
      }
      if (deployedFor !== null && deployedFor === liveRoundRef.current) {
        setDeployedRoundId(deployedFor);
      } else {
        setDeployedRoundId(null);
        toast.push({
          variant: "error",
          title: "The round closed while that was signing",
          body: "Your deploy may have landed in the next round. Check your wallet and the miners list before deploying again.",
        });
      }
      setDeployedTilesLocal([...selected]);
      setSelected(new Set());
    } catch {
      // Round rolled or already locked — the CTA state re-derives from data.
    } finally {
      setDeploying(false);
    }
  };

  const ctaLabel = !round.data
    ? "Deploy"
    : round.data.phase !== "active"
      ? "Settling..."
      : deploying
        ? "Deploying..."
        : hasDeployed
          ? "Deployed"
          : roundClosing
            ? "Round finishing"
            : dataStale
              ? "Reconnecting..."
              : wallet.status === "connected" && !balanceKnown
                ? "Checking balance..."
                : exceedsBalance && amountNum > 0 && tileCount > 0
                  ? "Insufficient funds"
                  : "Deploy";

  // MAX: spread (balance − dust buffer) across tiles × rounds. FLOOR at 4dp —
  // toFixed rounds half-up, which multiplied back by tiles×rounds could
  // exceed the balance and dead-end in "Insufficient funds" (audit finding).
  // (Recorded deviation: the reference's MAX sets the input to the raw wallet
  // balance; ours fits the per-tile amount to it — see Architecture Notes.)
  const applyMax = () => {
    const tiles = Math.max(1, tileCount);
    const per = Math.max(0, (balance - 0.01) / tiles / Math.max(1, rounds));
    setAmount(fmtTokenFloor(per, 4));
  };
  const addAmount = (v: number) =>
    setAmount(fmtToken((parseFloat(amount) || 0) + v, 4));

  /** Frosted glass − / + stepper key (Frosted Deck controls). */
  const stepBtn = (sign: "−" | "+", onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={sign === "+" ? "Increase" : "Decrease"}
      className="glass-key flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[16px] leading-none text-fg-body transition hover:text-fg disabled:cursor-default disabled:opacity-40"
    >
      {sign}
    </button>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 pb-6 pt-4 md:px-8 lg:flex-row lg:justify-center lg:gap-10 lg:pt-9 xl:gap-14">
      <h1 className="sr-only">Mine</h1>
      {/* Mobile: stats + LAST ROUND sit ABOVE the grid (reference mobile
          order). Render again in the sidebar for lg+ — pure store reads, so
          the duplicate mount is just a second subscription. */}
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 lg:hidden">
        <StatsStrip />
        <LastRoundBar />
      </div>
      {/* Left pane: the vine pentagon, centered. Below lg it tracks the
          560px column the stats block and sidebar use; from lg it goes
          wide. It carries no top offset, so it sits ~16px above the
          sidebar's lg:mt-4 baseline (a deliberate raise). */}
      <section className="mx-auto flex w-full min-w-0 max-w-[560px] items-center justify-center lg:mx-0 lg:max-w-[min(920px,calc(100dvh_-_160px))] lg:flex-1 lg:items-start">
        {round.data ? (
          <VineBoard
            round={round.data}
            selected={selected}
            deployedTiles={deployedTilesShown}
            interactive={interactive}
            onToggle={toggleTile}
          />
        ) : (
          <p className="text-fg-muted">Loading round...</p>
        )}
      </section>

      {/* Right sidebar */}
      <aside className="mx-auto flex w-full max-w-[560px] shrink-0 flex-col gap-4 lg:mx-0 lg:mt-4 lg:w-[480px] lg:max-w-none">
        <div className="hidden flex-col gap-4 lg:flex">
          <StatsStrip />
          <LastRoundBar />
        </div>

        {/* Deploy controls — ONE frosted pane with a flat interior (user
            2026-07-15: reduce box clutter). Amount + presets + tiles/rounds +
            per-round + deploy, grouped by spacing and a hairline rather than
            nested boxes. Wired to the live round/wallet state. */}
        <div className="glass-pane flex flex-col gap-4 rounded-[18px] px-5 py-5">
          {/* Amount + presets */}
          <div>
            <div className="flex items-center">
              <span className="text-[10px] uppercase tracking-[0.14em] text-fg-muted">
                Amount / Tile
              </span>
            </div>
            <div className="relative mt-1 flex flex-col items-center py-2">
              {/* Soft accent bloom behind the numeral (hex mesh removed, user
                  2026-07-15). */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 46% 58% at 50% 44%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 70%)",
                }}
              />
              <input
                type="text"
                inputMode="decimal"
                aria-label="ETH per tile"
                value={amount}
                placeholder="0"
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "" || AMOUNT_RE.test(next)) setAmount(next);
                }}
                onFocus={(e) => {
                  if (e.target.value === "0") setAmount("");
                }}
                onBlur={(e) => {
                  if (e.target.value === "") setAmount("0");
                }}
                className={`tnum relative z-[1] w-full bg-transparent text-center text-[56px] font-bold leading-[0.95] tracking-[-0.02em] caret-accent outline-none placeholder:text-ghost ${
                  amountNum === 0 ? "text-ghost" : "text-fg"
                }`}
              />
              {/* Wallet + ETH balance, centered under the numeral (user
                  2026-07-15: replaces the ETH glyph/word; the top-right chip
                  moved here). */}
              <span className="relative z-[1] mt-1.5 flex items-center gap-2 text-[13px] text-fg-muted">
                <WalletIcon size={14} />
                <span className="tnum text-fg-body">
                  Ξ {fmtToken(balance, 4)}
                </span>
              </span>
            </div>
            {/* presets — flat quiet chips (no edge-light) */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { label: "+0.01", onClick: () => addAmount(0.01) },
                { label: "+0.1", onClick: () => addAmount(0.1) },
                { label: "+1", onClick: () => addAmount(1) },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={c.onClick}
                  className="cursor-pointer rounded-lg bg-white/[0.03] py-2 text-[12px] text-fg-body transition hover:bg-white/[0.07] hover:text-fg"
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                onClick={applyMax}
                className="cursor-pointer rounded-lg bg-accent/[0.08] py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-accent transition hover:bg-accent/15"
              >
                MAX
              </button>
            </div>
          </div>

          <div className="h-px bg-line-slate/50" />

          {/* Tiles / Rounds / Per Round — flat rows, no inner boxes */}
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
                Tiles
              </span>
              <span className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => {
                    if (!interactive) return;
                    // Toggle: a fully-lit board clears; anything else fills.
                    setSelected((prev) =>
                      prev.size === ALL_TILES.length
                        ? new Set()
                        : new Set(ALL_TILES),
                    );
                  }}
                  className="glass-key h-7 cursor-pointer rounded-lg px-3 text-[12px] font-bold text-fg-body transition hover:text-fg disabled:cursor-default disabled:opacity-40"
                >
                  ALL
                </button>
                <span className="flex items-center gap-3">
                  {stepBtn("−", () => stepTiles(-1), !interactive)}
                  <span className="tnum w-6 text-center text-[20px] font-bold text-fg">
                    {tileCount}
                  </span>
                  {stepBtn("+", () => stepTiles(1), !interactive)}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
                Rounds
              </span>
              <span className="flex items-center gap-3">
                {/* Steps of 5, floored at the manual single round: 1 ⇄ 5 ⇄ 10 … */}
                {stepBtn(
                  "−",
                  () => setRounds((r) => Math.max(1, r <= 5 ? 1 : r - 5)),
                  false,
                )}
                <span className="tnum w-6 text-center text-[20px] font-bold text-fg">
                  {rounds}
                </span>
                {stepBtn(
                  "+",
                  () => setRounds((r) => Math.min(100, r === 1 ? 5 : r + 5)),
                  false,
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
                Per Round
              </span>
              <span className="tnum text-[15px] font-semibold text-fg-body">
                Ξ {fmtToken(perRound, 4)}
              </span>
            </div>

            {/* Multi-round = prepaid AutoMiner: disclose the executor fee and
                the total deposit the setConfig tx will carry (live mode only —
                the quote hook returns null in the mock/simulation build). */}
            {quote && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
                    Executor Fee / Round
                  </span>
                  <span className="tnum text-[15px] font-semibold text-fg-body">
                    Ξ {fmtToken(fromWei(quote.feePerRound.toString()), 6)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
                    Total Deposit
                  </span>
                  <span className="tnum text-[15px] font-semibold text-fg">
                    Ξ {fmtToken(fromWei(quote.deposit.toString()), 4)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Deploy */}
          <span aria-live="polite" className="sr-only">
            {ctaLabel}
          </span>
          <button
            type="button"
            aria-disabled={!canDeploy}
            onClick={() => {
              // Guarded rather than natively disabled: a disabled element
              // loses keyboard focus the instant it is clicked, stranding
              // the user. This keeps focus on the button through the
              // deploying -> deployed transition.
              if (canDeploy) deploy();
            }}
            className={`mt-1 rounded-[14px] py-4 text-[15px] font-extrabold uppercase tracking-[0.14em] transition ${
              canDeploy
                ? "cursor-pointer bg-accent text-on-light shadow-[0_0_30px_-6px_var(--color-accent)] hover:brightness-110"
                : "bg-white/[0.05] text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line-slate)]"
            }`}
          >
            {ctaLabel}
          </button>

          {/* Active AutoMiner config: progress + stop/refund control. */}
          {automine.data?.active && (
            <div className="flex items-center justify-between gap-3 rounded-[12px] bg-white/[0.03] px-3.5 py-3">
              <span className="text-[12.5px] text-fg-body">
                AutoMiner active:{" "}
                <span className="tnum font-bold text-fg">
                  {automine.data.roundsRemaining}
                </span>{" "}
                rounds left
              </span>
              <button
                type="button"
                disabled={stopAutomine.pending}
                onClick={() => void stopAutomine.run().catch(() => {})}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-line-slate px-3 py-1.5 text-[12px] font-semibold text-fg-body transition hover:border-danger hover:text-danger disabled:cursor-default disabled:opacity-50"
              >
                {stopAutomine.pending
                  ? "Stopping..."
                  : `Stop · refund Ξ ${automine.data.totalRefundableFormatted}`}
              </button>
            </div>
          )}
        </div>

        <MinersFeed />
      </aside>
    </div>
  );
}
