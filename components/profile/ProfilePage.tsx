"use client";

/**
 * /profile — the full profile page (plan: reference/profile-plan.md,
 * P0+P1 2026-07-30). Reached ONLY through the drawer's "View full
 * profile" button (itself env-gated while this is being built) or the
 * URL — no nav entries anywhere (user decision 4).
 *
 * Layout: the site's WideContainer, then two columns ≥lg in the user's
 * chosen shape — LEFT identity + trophies + portfolio + staking, RIGHT
 * round history. Identity editing goes through the SAME useProfileEditor
 * hook as the drawer: one seam, zero drift.
 *
 * States are designed, not accidental: every not-connected state (incl.
 * initializing) renders the connect prompt, because a provider that never
 * finishes initializing would otherwise strand a skeleton forever (found
 * live). Everything unknown renders a dash, never a zero.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import {
  ChartCard,
  Pager,
  TableScroller,
  TD,
  TH,
  usePage,
} from "@/components/explore/shared";
import {
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DiscordIcon,
  EthIcon,
  PencilIcon,
  PersonIcon,
} from "@/components/icons";
import { BoardMini } from "@/components/mine/BoardMini";
import { AvatarCropper } from "@/components/profile/AvatarCropper";
import { PageHeader, WideContainer } from "@/components/PageHeader";
import { PeaRow, Row } from "@/components/profile/rows";
import { TickingYield } from "@/components/stake/TickingYield";
import {
  fmtInt,
  fmtRoundId,
  fmtToken,
  fmtUsd,
  shortAddr,
} from "@/lib/format";
import { usePrices } from "@/lib/hooks/useGame";
import { useUserHistory } from "@/lib/hooks/useUserHistory";
import { useProfileEditor } from "@/lib/hooks/useProfileEditor";
import { useRewards, useStakingPosition } from "@/lib/user/userData";
import type { HookResult, UserRoundVM, UserTotalsVM } from "@/lib/types";
import { useBalances, useWallet } from "@/lib/walletContext";

/** Ledger-row timestamp: "2026-07-30 14:03 UTC" (the Stockpot form).
 * Guarded: new Date(NaN).toISOString() THROWS, and one malformed
 * timestamp from the backend would take the whole page to the error
 * boundary the moment a user expanded that row. */
function stamp(atMs: number): string {
  if (!Number.isFinite(atMs) || atMs <= 0) return "—";
  const iso = new Date(atMs).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

// The PnL cards (net, deployed, PEA won, win rate) are DELIBERATELY not
// in v1 (user 2026-07-30): they ship as their own release alongside the
// shareable PnL cards, so the profile lands first and the money surface
// gets its own announcement. Everything they need already exists —
// useUserRounds returns the folded totals, StatCard carries the up/down
// tone prop — so re-adding them is a render, not a rebuild.

function Trophies({ totals }: { totals: UserTotalsVM }) {
  return (
    <ChartCard title="Trophies" headingAs="h2">
      <div className="flex flex-col">
        <Row label="Best round">
          {totals.bestRound && totals.bestRound.netEth > 0 ? (
            <span className="flex items-baseline gap-2">
              <span
                className={`tnum text-[15px] font-semibold ${
                  totals.bestRound.netEth > 0 ? "text-accent" : "text-fg"
                }`}
              >
                {totals.bestRound.netEthFormatted} ETH
              </span>
              <span className="tnum text-[12.5px] text-fg-muted">
                {fmtRoundId(totals.bestRound.roundId)}
              </span>
            </span>
          ) : (
            <span className="text-[15px] text-fg-muted">—</span>
          )}
        </Row>
        <Row label="Best win streak">
          <span className="tnum text-[15px] font-semibold text-fg">
            {totals.bestWinStreak > 0
              ? `${fmtInt(totals.bestWinStreak)} in a row`
              : "—"}
          </span>
        </Row>
        <Row label="Peapot hits">
          <span className="tnum text-[15px] font-semibold text-fg">
            {totals.peapotHitsFormatted}
          </span>
        </Row>
      </div>
    </ChartCard>
  );
}

function ResultCell({ r }: { r: UserRoundVM }) {
  return (
    <span className="flex items-center gap-2">
      <span className={r.outcome === "won" ? "text-accent" : "text-fg-muted"}>
        {r.resultLabel}
      </span>
      {r.peapotHit && (
        <span className="rounded-full border border-accent/50 px-1.5 text-[10px] font-bold tracking-[0.04em] text-accent">
          PEAPOT
        </span>
      )}
    </span>
  );
}

function HistoryCard({
  rounds,
  status,
}: {
  rounds: UserRoundVM[];
  status: HookResult<unknown>["status"];
}) {
  const [winnersOnly, setWinnersOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const filtered = winnersOnly
    ? rounds.filter((r) => r.outcome === "won")
    : rounds;
  const pg = usePage(filtered);
  const setPage = pg.setPage;
  const toggleWinners = () => {
    setWinnersOnly((v) => !v);
    // Without this the clamp lands you on the LAST page of the filtered
    // list, and untoggling teleports back to an unrelated deep page.
    setPage(0);
  };

  return (
    <ChartCard
      title="Round history"
      headingAs="h2"
      subtitle="Every settled round you mined, newest first."
      actions={
        rounds.length > 0 ? (
          <button
            type="button"
            aria-pressed={winnersOnly}
            onClick={toggleWinners}
            className={`focus-ring cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              winnersOnly
                ? "bg-accent/[0.12] text-accent"
                : "bg-white/[0.03] text-fg-muted hover:text-fg"
            }`}
          >
            Winners only
          </button>
        ) : undefined
      }
    >
      {/* Status FIRST. Collapsing loading and error into the empty state
          told a wallet with hundreds of rounds it had never mined, and
          told it permanently when the fetch failed (audit 2026-07-30). */}
      {status === "loading" && rounds.length === 0 ? (
        <div className="flex flex-col" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse border-b border-line-slate/50 bg-white/[0.05]"
            />
          ))}
        </div>
      ) : status === "error" && rounds.length === 0 ? (
        <p className="px-2 py-12 text-center text-[14px] text-fg-body">
          Your history did not load. Retrying shortly.
        </p>
      ) : rounds.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-[14px] leading-relaxed text-fg-body">
            Your settled rounds will appear here.
          </p>
          <Link
            href="/"
            className="focus-ring flex h-9 items-center rounded-full border-[1.5px] border-accent px-5 text-[13px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-light"
          >
            Mine a round
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-2 py-10 text-center text-[14px] text-fg-body">
          No wins yet. They land here when the vine finds your tile.
        </p>
      ) : (
        <>
          <TableScroller label="Round history table">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">
                Your settled rounds with deployed, result, and rewards
              </caption>
              <thead>
                <tr className="border-b border-line-slate">
                  <th className={TH}>Round</th>
                  <th className={`${TH} text-right`}>Deployed</th>
                  <th className={`${TH} pl-6`}>Result</th>
                  <th className={`${TH} text-right`}>Net</th>
                  <th className={`${TH} text-right`}>PEA</th>
                  <th className={TH} aria-label="Details" />
                </tr>
              </thead>
              <tbody>
                {pg.slice.map((r) => (
                  <ProfileHistoryRow
                    key={r.roundId}
                    r={r}
                    expanded={expanded === r.roundId}
                    onToggle={() =>
                      setExpanded((cur) =>
                        cur === r.roundId ? null : r.roundId,
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </TableScroller>
          <Pager
            page={pg.page}
            pages={pg.pages}
            start={pg.start}
            size={pg.size}
            total={pg.total}
            onPage={pg.setPage}
          />
        </>
      )}
    </ChartCard>
  );
}

function ProfileHistoryRow({
  r,
  expanded,
  onToggle,
}: {
  r: UserRoundVM;
  expanded: boolean;
  onToggle(): void;
}) {
  return (
    <>
      <tr className="border-b border-line-slate/50">
        <td className={`${TD} tnum`}>{fmtRoundId(r.roundId)}</td>
        <td className={`${TD} tnum text-right`}>{r.deployedFormatted}</td>
        <td className={`${TD} pl-6 text-[14px]`}>
          <ResultCell r={r} />
        </td>
        {/* A win whose checkpoint has not landed reports zeroed rewards,
            so its net would read as a full loss in coral under a lime
            "Won, pending" label. Dash both money cells until the chain
            says what was actually paid. */}
        <td
          className={`${TD} tnum text-right ${
            r.rewardPending
              ? "text-fg-muted"
              : r.netEth > 0
                ? "text-accent"
                : r.netEth < 0
                  ? "text-danger"
                  : "text-fg-muted"
          }`}
        >
          {r.rewardPending ? (
            "—"
          ) : (
            <span className="flex flex-col items-end leading-tight">
              <span>{r.netEthFormatted}</span>
              {r.netPct !== null && r.netPct > -100 && (
                <span className="text-[12px] font-normal text-fg-muted">
                  {r.netPctFormatted}
                </span>
              )}
            </span>
          )}
        </td>
        <td className={`${TD} tnum text-right`}>
          {r.rewardPending ? (
            "—"
          ) : r.wonPea > 0 ? (
            r.wonPeaFormatted
          ) : (
            <span className="text-fg-muted">0</span>
          )}
        </td>
        <td className={`${TD} text-right`}>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`Round ${r.roundId} details`}
            onClick={onToggle}
            className="focus-ring cursor-pointer rounded-lg p-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            <ChevronDownIcon
              size={15}
              className={expanded ? "rotate-180" : undefined}
            />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line-slate/50">
          <td colSpan={7} className="py-4">
            <div className="flex flex-wrap items-center gap-6">
              <BoardMini
                tiles={r.tiles}
                winningTile={r.winningTile}
                className="h-[190px] w-[190px] shrink-0"
              />
              <dl className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-4">
                  <dt className="micro-label">Settled</dt>
                  <dd className="tnum text-[13px] text-fg-body">
                    {stamp(r.settledAt)}
                  </dd>
                </div>
                <div className="flex items-center gap-4">
                  <dt className="micro-label">Winning tile</dt>
                  <dd className="tnum text-[13px] text-fg-body">
                    {r.winningTile + 1}
                  </dd>
                </div>
                <div className="flex items-center gap-4">
                  <dt className="micro-label">Your tiles</dt>
                  <dd className="tnum text-[13px] text-fg-body">
                    {r.tiles.map((t) => t + 1).join(", ")}
                  </dd>
                </div>
                <div className="flex items-center gap-4">
                  <dt className="micro-label">Source</dt>
                  <dd className="text-[13px] text-fg-body">
                    {r.source === "automine" ? "Automine" : "Manual"}
                  </dd>
                </div>
                <div className="flex items-center gap-4">
                  <dt className="micro-label">Won</dt>
                  <dd className="tnum text-[13px] text-fg-body">
                    {r.wonEthFormatted} ETH
                    {r.wonPea > 0 ? ` · ${r.wonPeaFormatted} PEA` : ""}
                  </dd>
                </div>
              </dl>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ProfilePage() {
  const wallet = useWallet();
  const editor = useProfileEditor();
  const balances = useBalances();
  const prices = usePrices();
  const stakingPos = useStakingPosition();
  const rewards = useRewards();
  // Mock mode folds the engine's slice; live mode fetches the backend's
  // history endpoint. Same VM either way, so nothing below knows.
  const history = useUserHistory(wallet.address);

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editor.editing) inputRef.current?.focus();
  }, [editor.editing]);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copy = () => {
    if (!wallet.address) return;
    void navigator.clipboard?.writeText(wallet.address).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  const b = balances.data;
  // `undefined` from these hooks means UNKNOWN (loading or failed), not
  // zero. Printing 0 told a wallet holding 12,000 staked PEA it held
  // none, and the bold Total silently omitted it (audit 2026-07-30).
  const staked = stakingPos.data?.staked;
  const refined = rewards.data?.refinedPea;
  const unrefined = rewards.data?.unrefinedPea;
  const stakedFmt = staked === undefined ? "—" : fmtToken(staked, 2);
  const total =
    b && staked !== undefined && refined !== undefined && unrefined !== undefined
      ? b.pea + staked + refined + unrefined
      : null;
  const ethUsd = prices.data?.ethUsd ?? 0;

  return (
    // The site's wide page container (Explore/Docs): full width with the
    // house side padding, so the page breathes instead of sitting in a
    // narrow centred band with dead space either side.
    <WideContainer>
      <PageHeader
        title="Profile"
        subtitle="Your identity, holdings, and mining record."
      />

      {editor.pendingFile && (
        <AvatarCropper
          file={editor.pendingFile}
          onCancel={editor.cancelAvatarCrop}
          onApply={editor.applyAvatar}
        />
      )}

      {/* One prompt for every not-connected state: the ConnectButton
          disables itself while the wallet is initializing, so a slow (or
          misconfigured) provider shows a disabled Connect, never an
          indefinite skeleton (found live: a Privy origin that cannot
          init left the page on placeholder bars forever). */}
      {wallet.status !== "connected" && (
        <div className="mt-10 flex flex-col items-center gap-5 rounded-[16px] border border-line-slate bg-gradient-to-br from-surface-active/40 via-panel to-bg px-6 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-full border border-line-slate bg-surface">
            <PersonIcon size={28} className="text-fg-body" />
          </span>
          <p className="max-w-[360px] text-[14.5px] leading-relaxed text-fg-body">
            {wallet.status === "initializing"
              ? "Checking your wallet."
              : "Connect a wallet to see your profile, holdings, and round history."}
          </p>
          {wallet.status !== "initializing" && <ConnectButton />}
        </div>
      )}

      {/* ONE spacing scale for the whole page: SPACE (24px) between every
          card in a column, the same SPACE between the columns, and the
          cards' own p-6 inside. Every block is a ChartCard — the identity
          panel used to be the one uncarded thing, which made the left
          column read as loose content followed by cards and left the two
          columns' tops misaligned (one had a border, one did not). */}
      {wallet.status === "connected" && (
        <div className="mt-10 pb-12">
          <div className="grid gap-6 xl:grid-cols-[320px_1fr] xl:items-start">
            {/* LEFT: identity + trophies + portfolio + staking */}
            <div className="flex flex-col gap-6">
              <ChartCard>
                <div className="flex justify-center">
                  <span className="relative">
                    <span className="flex size-28 items-center justify-center overflow-hidden rounded-full border border-line-slate bg-surface">
                      {editor.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local data URL, next/image adds nothing
                        <img
                          src={editor.avatar}
                          alt="Profile picture"
                          className="size-full object-cover"
                        />
                      ) : (
                        <PersonIcon size={44} className="text-fg-body" />
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label="Upload profile picture"
                      onClick={() => fileRef.current?.click()}
                      className="focus-ring absolute -bottom-0.5 -right-0.5 flex size-9 cursor-pointer items-center justify-center rounded-full border border-line-slate bg-surface text-fg-body transition-colors hover:border-accent hover:text-accent"
                    >
                      <CameraIcon size={15} />
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-label="Profile picture file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        editor.onAvatarPick(file);
                      }}
                    />
                  </span>
                </div>
                {editor.avatar && (
                  <div className="mt-2 flex justify-center">
                    <button
                      type="button"
                      onClick={editor.removeAvatar}
                      className="cursor-pointer text-[12px] font-light text-fg-muted transition-colors hover:text-danger"
                    >
                      Remove photo
                    </button>
                  </div>
                )}
                {editor.nameTaken && (
                  <p
                    role="alert"
                    className="mt-2 text-center text-[12px] text-danger"
                  >
                    That username is taken.
                  </p>
                )}

                {/* Same 24px step the cards use between each other, so the
                    rhythm does not change when you cross a card border. */}
                <div className="mt-6 flex flex-col">
                  <Row label="Address">
                    <span className="flex items-center gap-2.5">
                      <span className="tnum text-[15px] font-semibold text-fg">
                        {wallet.address ? shortAddr(wallet.address) : "—"}
                      </span>
                      <button
                        type="button"
                        aria-label="Copy address"
                        onClick={copy}
                        className={`cursor-pointer transition-colors ${
                          copied ? "text-accent" : "text-fg-muted hover:text-fg"
                        }`}
                      >
                        {copied ? (
                          <CheckIcon size={14} />
                        ) : (
                          <CopyIcon size={14} />
                        )}
                        <span aria-live="polite" className="sr-only">
                          {copied ? "Address copied" : ""}
                        </span>
                      </button>
                    </span>
                  </Row>
                  <Row label="Username">
                    {editor.editing ? (
                      <span className="flex items-center gap-2">
                        <input
                          ref={inputRef}
                          value={editor.draft}
                          onChange={(e) => editor.setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") editor.saveUsername();
                            if (e.key === "Escape") editor.cancelEdit();
                          }}
                          aria-label="Username"
                          className="tnum h-8 w-36 rounded-lg border border-line-slate bg-surface px-2 text-[14px] text-fg outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={editor.saveUsername}
                          className="cursor-pointer text-[13px] font-bold text-accent"
                        >
                          Save
                        </button>
                      </span>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="min-w-0 truncate text-[15px] font-semibold text-fg">
                          {editor.username || (
                            <span className="text-fg-muted">None</span>
                          )}
                        </span>
                        <button
                          type="button"
                          aria-label="Edit username"
                          onClick={editor.startEdit}
                          className="shrink-0 cursor-pointer text-fg-muted transition-colors hover:text-fg"
                        >
                          <PencilIcon size={14} />
                        </button>
                      </span>
                    )}
                  </Row>
                  <Row label="Discord">
                    {editor.discord ? (
                      editor.discord.username ? (
                        <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-fg">
                          <DiscordIcon
                            size={15}
                            className="shrink-0 text-fg-muted"
                          />
                          <span className="min-w-0 truncate">
                            {editor.discord.username}
                          </span>
                          <button
                            type="button"
                            onClick={() => void editor.disconnectDiscord()}
                            className="shrink-0 cursor-pointer text-[12px] font-light text-fg-muted transition-colors hover:text-danger"
                          >
                            Unlink
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => editor.discord?.link()}
                          className="flex h-8 cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-accent px-3 text-[13px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-light"
                        >
                          <DiscordIcon size={15} />
                          Connect
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="flex h-8 items-center gap-2 rounded-full border-[1.5px] border-line-slate px-3 text-[13px] font-bold text-fg-disabled"
                      >
                        <DiscordIcon size={15} />
                        Soon
                      </button>
                    )}
                  </Row>
                </div>
              </ChartCard>

              {history.data?.totals && (
                <Trophies totals={history.data.totals} />
              )}

              <ChartCard title="Portfolio" headingAs="h2">
                <div className="flex flex-col">
                  <PeaRow label="Wallet" value={b?.peaFormatted ?? "—"} />
                  <PeaRow label="Staked" value={stakedFmt} />
                  <PeaRow
                    label="Harvested"
                    value={refined === undefined ? "—" : fmtToken(refined, 2)}
                  />
                  <PeaRow
                    label="Unharvested"
                    value={
                      unrefined === undefined ? "—" : fmtToken(unrefined, 2)
                    }
                  />
                  <PeaRow
                    label="Total"
                    value={total === null ? "—" : fmtToken(total, 2)}
                    strong
                  />
                  <Row label="ETH">
                    <span className="flex items-center gap-2">
                      <EthIcon size={15} className="text-fg" />
                      <span className="tnum text-[15px] font-semibold text-fg">
                        {b?.ethFormatted ?? "—"}
                      </span>
                      {b && ethUsd > 0 && (
                        <span className="tnum text-[12.5px] text-fg-muted">
                          {fmtUsd(b.eth * ethUsd)}
                        </span>
                      )}
                    </span>
                  </Row>
                </div>
              </ChartCard>

              <ChartCard title="Staking yield" headingAs="h2">
                <div className="flex flex-col">
                  <Row label="Pending yield">
                    <span className="tnum text-[15px] font-semibold text-fg">
                      <TickingYield
                        pendingYield={stakingPos.data?.pendingYield}
                        stakedPea={staked ?? 0}
                        aprPct={null}
                        address={wallet.address}
                        pollChain
                      />
                    </span>
                  </Row>
                </div>
              </ChartCard>
            </div>

            {/* RIGHT: round history */}
            <HistoryCard
              rounds={history.data?.rounds ?? []}
              status={history.status}
            />
          </div>
        </div>
      )}
    </WideContainer>
  );
}
