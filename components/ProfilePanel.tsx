"use client";

/**
 * Profile side panel (user direction 2026-07-13, modeled on the reference's
 * drawer): clicking the CONNECTED pill opens this instead of disconnecting.
 * Right-side drawer — avatar with local photo upload, address + copy icon,
 * localStorage username with pencil edit, Discord linking (Privy-native via
 * the useDiscord seam; "Soon" under the stub), a "View full profile" link
 * to /profile, PEA portfolio (Wallet / Staked / Harvested / Unharvested /
 * Total), Disconnect at the bottom.
 *
 * The editing STATE + mutations live in lib/hooks/useProfileEditor
 * (extracted 2026-07-30 for the /profile page — one seam, two surfaces,
 * zero drift; the hook is event-subscribed so a save on either surface
 * updates the other). This file keeps only the drawer chrome and its
 * audit-pinned dialog contract:
 * - real dialog focus management: focus moves to the close button on
 *   open, Tab is trapped inside, and focus returns to the opener on close
 * - the backdrop is a non-focusable div (a <button> added an invisible
 *   tab stop); Escape + the ✕ button are the keyboard paths
 * - Escape while editing the username cancels the EDIT (handled in the
 *   drawer's own document listener via editingRef — stopPropagation can't
 *   scope same-node listeners); transient state resets when it closes;
 *   the page scroll-locks while the drawer is open
 * - the file input resets after each pick so re-choosing the same file
 *   works; copy feedback timer is tracked
 * - "View full profile" calls onClose on navigate: the portal drawer does
 *   not unmount on route change and its scroll lock would otherwise leave
 *   body{overflow:hidden} stuck on the destination page
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CameraIcon,
  CheckIcon,
  CopyIcon,
  DiscordIcon,
  PencilIcon,
  PersonIcon,
} from "@/components/icons";
import { PeaRow, Row } from "@/components/profile/rows";
import { fmtToken, shortAddr } from "@/lib/format";
import { useProfileEditor } from "@/lib/hooks/useProfileEditor";
import { useRewards, useStakingPosition } from "@/lib/user/userData";
import { useBalances, useWallet } from "@/lib/walletContext";

export function ProfilePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const { address, disconnect } = useWallet();
  const editor = useProfileEditor();
  const balances = useBalances();
  // Live (API mode) portfolio + claimable rewards; both hooks return
  // undefined data in the mock shell, keeping the original zeroed rows.
  const stakingPos = useStakingPosition();
  const rewards = useRewards();
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live mirror for the document-level key handler: stopPropagation can't
  // shield the input — Next hydrates React at `document`, so BOTH listeners
  // share that node and stopPropagation is a no-op between them (audit,
  // proven live; jsdom hid it by mounting React on a container div).
  const editingRef = useRef(false);
  useEffect(() => {
    editingRef.current = editor.editing;
  }, [editor.editing]);

  // Transient state must not survive a close/reopen (audit): reset via the
  // adjust-state-during-render pattern the moment the drawer is closed.
  if (!open && (editor.editing || copied || editor.draft !== "")) {
    editor.cancelEdit();
    setCopied(false);
  }

  // Dialog keyboard contract (audit): move focus in on open, trap Tab,
  // Escape closes, and focus returns to the opener on close (cleanup).
  const cancelEdit = editor.cancelEdit;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Mid-edit Escape cancels the EDIT; only a second Escape closes.
        if (editingRef.current) {
          editingRef.current = false;
          cancelEdit();
        } else {
          onClose();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([type="file"]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open, onClose, cancelEdit]);

  useEffect(() => {
    if (editor.editing) inputRef.current?.focus();
  }, [editor.editing]);

  // Scroll-lock the page while the drawer is open (audit: wheel over the
  // backdrop scrolled the page behind the "modal").
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Tracked copy-feedback timer (audit): cleared on re-click and unmount.
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  if (!open) return null;

  const copy = () => {
    if (!address) return;
    void navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  const b = balances.data;
  // Backend-owned in API mode; the hooks return undefined in the mock shell
  // so these fall back to the original zeroed rows.
  const staked = stakingPos.data?.staked ?? 0;
  const refined = rewards.data?.refinedPea ?? 0;
  const unrefined = rewards.data?.unrefinedPea ?? 0;
  const total = b ? b.pea + staked + refined + unrefined : null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop: non-focusable (a <button> here added an invisible tab
          stop — audit); Escape + the ✕ button are the keyboard paths.
          Frosted blur over the page (user direction 2026-07-13). */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-bg/50 backdrop-blur-sm"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Profile"
        className="scroll-slim absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col overflow-y-auto overscroll-contain border-l border-line-slate bg-bg px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5"
      >
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-ml-2 flex size-9 cursor-pointer items-center justify-center self-start rounded-full text-fg-muted transition-colors hover:text-fg"
        >
          ✕
        </button>

        {/* Avatar + upload badge */}
        <div className="mt-2 flex justify-center">
          <span className="relative">
            <span className="flex size-24 items-center justify-center overflow-hidden rounded-full border border-line-slate bg-surface">
              {editor.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL, next/image adds nothing
                <img
                  src={editor.avatar}
                  alt="Profile picture"
                  className="size-full object-cover"
                />
              ) : (
                <PersonIcon size={40} className="text-fg-body" />
              )}
            </span>
            <button
              type="button"
              aria-label="Upload profile picture"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-0.5 -right-0.5 flex size-8 cursor-pointer items-center justify-center rounded-full border border-line-slate bg-surface text-fg-body transition-colors hover:border-accent hover:text-accent"
            >
              <CameraIcon size={14} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Profile picture file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so picking the SAME file again re-fires (audit).
                e.target.value = "";
                void editor.onAvatarPick(file);
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
          <p role="alert" className="mt-2 text-center text-[12px] text-danger">
            That username is taken.
          </p>
        )}

        <div className="mt-8 flex flex-col">
          <Row label="Address">
            <span className="flex items-center gap-2.5">
              <span className="tnum text-[15px] font-semibold text-fg">
                {address ? shortAddr(address) : "—"}
              </span>
              <button
                type="button"
                aria-label="Copy address"
                onClick={copy}
                className={`cursor-pointer transition-colors ${
                  copied ? "text-accent" : "text-fg-muted hover:text-fg"
                }`}
              >
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
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
                    // Escape is handled by the drawer's document listener
                    // (cancels the edit there — stopPropagation can't work
                    // across same-node listeners; see editingRef above).
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
                  <DiscordIcon size={15} className="shrink-0 text-fg-muted" />
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
                <span className="flex min-w-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => editor.discord?.link()}
                    className="flex h-8 cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-accent px-3 text-[13px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-light"
                  >
                    <DiscordIcon size={15} />
                    Connect
                  </button>
                  {editor.discord.error && (
                    <span role="alert" className="text-[12px] text-danger">
                      {editor.discord.error}
                    </span>
                  )}
                </span>
              )
            ) : (
              // Stub wallet can't link accounts.
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

        {/* Full page: history, PnL and stats live there; closing first
            keeps the drawer's scroll lock from following us.
            ENV-GATED while /profile is still being built (user
            2026-07-30): the route stays reachable by URL for us, but no
            miner is handed a door to a half-finished page. Flip
            NEXT_PUBLIC_PROFILE_PAGE=1 in Vercel to launch it. */}
        {process.env.NEXT_PUBLIC_PROFILE_PAGE === "1" && (
          <Link
            href="/profile"
            onClick={onClose}
            className="focus-ring mt-6 flex h-[42px] items-center justify-center rounded-full border-[1.5px] border-accent text-[14px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-light"
          >
            View full profile
          </Link>
        )}

        <h2 className="font-wordmark mt-8 text-[20px] font-bold tracking-[-0.01em] text-fg">
          Portfolio
        </h2>
        <div className="mt-2 flex flex-col">
          <PeaRow label="Wallet" value={b?.peaFormatted ?? "—"} />
          <PeaRow label="Staked" value={fmtToken(staked, 2)} />
          <PeaRow label="Harvested" value={fmtToken(refined, 2)} />
          <PeaRow label="Unharvested" value={fmtToken(unrefined, 2)} />
          <PeaRow
            label="Total"
            value={total === null ? "—" : fmtToken(total, 2)}
            strong
          />
        </div>

        {/* Claiming lives on the deploy pane now (components/mine/ClaimRewards),
            where a miner is already looking. Duplicating it here meant two
            places to keep in step for the same action. */}

        <div className="mt-auto pt-10">
          <button
            type="button"
            onClick={() => {
              disconnect();
              onClose();
            }}
            className="h-[46px] w-full cursor-pointer rounded-full border-[1.5px] border-line-slate text-[15px] font-semibold text-fg-body transition-colors hover:border-danger hover:text-danger"
          >
            Disconnect
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
