"use client";

/**
 * Profile side panel (user direction 2026-07-13, modeled on the reference's
 * drawer): clicking the CONNECTED pill opens this instead of disconnecting.
 * Right-side drawer — avatar with local photo upload, address + copy icon,
 * localStorage username with pencil edit, Discord linking (Privy-native via
 * the useDiscord seam; "Soon" under the stub), PEA portfolio (Wallet /
 * Staked / Harvested / Unharvested / Total), Disconnect at the bottom.
 *
 * Audit hardening (2026-07-13, all findings adversarially verified):
 * - localStorage access is try/catch-guarded — with storage blocked
 *   (Chrome "Block all cookies") a bare read here crashed EVERY route,
 *   since the header mounts this component everywhere
 * - real dialog focus management: focus moves to the close button on
 *   open, Tab is trapped inside, and focus returns to the opener on close
 * - the backdrop is a non-focusable div (a <button> added an invisible
 *   tab stop); Escape + the ✕ button are the keyboard paths
 * - Escape while editing the username cancels the EDIT (handled in the
 *   drawer's own document listener via editingRef — stopPropagation can't
 *   scope same-node listeners); transient state resets when it closes;
 *   the page scroll-locks while the drawer is open
 * - the file input resets after each pick so re-choosing the same file
 *   works; avatar persistence tolerates quota/blocked storage
 * - copy feedback timer is tracked (no overlap truncation / stale fires)
 *
 * Shell scope: username + avatar persist in localStorage only (hydrated in
 * effects — Convention 7); Staked/Harvested/Unharvested read 0 until a real
 * backend owns them. Avatar uploads downscale to 128px JPEG client-side.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CameraIcon,
  CheckIcon,
  CopyIcon,
  DiscordIcon,
  PeaIcon,
  PencilIcon,
  PersonIcon,
} from "@/components/icons";
import { fmtToken, shortAddr } from "@/lib/format";
import { useRewards, useStakingPosition } from "@/lib/user/userData";
import {
  useAccessToken,
  useBalances,
  useDiscord,
  useWallet,
} from "@/lib/walletContext";
import {
  announceProfileChange,
  avatarKey,
  invalidateProfile,
  purgeLegacyProfile,
  pushProfile,
  readLocalProfile,
  usernameKey,
  useProfiles,
} from "@/lib/profile";

// Keys + change event live in lib/profile.ts (shared with the MINERS
// panel's YOU rows, which subscribe via useLocalProfile).
const AVATAR_SIZE = 128;

/** localStorage that never throws (blocked storage / quota — audit). */
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked or quota-exceeded — the value lives for this session only.
  }
}

/** File → square-cropped, downscaled JPEG data URL (localStorage-sized). */
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unavailable"));
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_SIZE,
        AVATAR_SIZE,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable image"));
    };
    img.src = url;
  });
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-10 items-center justify-between gap-4">
      <span className="shrink-0 text-[15px] text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

function PeaRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <Row label={label}>
      <span className="flex items-center gap-2">
        <PeaIcon size={15} className="text-accent" />
        <span
          className={`tnum text-[15px] text-fg ${strong ? "font-bold" : "font-semibold"}`}
        >
          {value}
        </span>
      </span>
    </Row>
  );
}

export function ProfilePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const { address, disconnect } = useWallet();
  // Storage keys and shared rows are both lowercased — one normalisation
  // point so a checksummed address can never read a key it did not write.
  const addr = address?.toLowerCase() ?? null;
  const sharedRow = useProfiles(addr ? [addr] : []).get(addr ?? "");
  const balances = useBalances();
  const getToken = useAccessToken();
  const discord = useDiscord();
  // Live (API mode) portfolio + claimable rewards; both hooks return
  // undefined data in the mock shell, keeping the original zeroed rows.
  const stakingPos = useStakingPosition();
  const rewards = useRewards();
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  /** Shared-profile write rejected: username already taken (409). */
  const [nameTaken, setNameTaken] = useState(false);
  // Discord link registration (Supabase social_connections + community
  // roles). Runs whenever the panel sees a linked Discord: the route is
  // idempotent, verifies everything against Privy server-side, and doubles
  // as an on-demand role refresh. One POST per (address, username) pair.
  const registeredFor = useRef<string | null>(null);
  const discordUsername = discord?.username ?? null;
  useEffect(() => {
    if (!discordUsername || !address || !getToken) return;
    const key = `${address}:${discordUsername}`;
    if (registeredFor.current === key) return;
    registeredFor.current = key;
    void getToken()
      .then((token) => {
        if (!token) return;
        return fetch("/api/discord/register", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ address }),
        });
      })
      .catch(() => {
        // Registration is additive; a failed attempt retries next open.
        registeredFor.current = null;
      });
  }, [discordUsername, address, getToken]);
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
    editingRef.current = editing;
  }, [editing]);

  // Transient state must not survive a close/reopen (audit): reset via the
  // adjust-state-during-render pattern the moment the drawer is closed.
  if (!open && (editing || copied || draft !== "")) {
    setEditing(false);
    setCopied(false);
    setDraft("");
  }

  // localStorage only after mount (Convention 7 — hydration safety),
  // guarded (audit: bare reads crash when the browser blocks storage).
  // Keyed on the ADDRESS, not mount: this used to run once with an empty dep
  // array against browser-global keys, so connecting a second wallet kept the
  // first one's name and photo on screen and, worse, let them be published
  // to the second wallet's row. Disconnecting clears it for the same reason.
  // Deferred: a synchronous setState in an effect body cascades renders.
  useEffect(() => {
    purgeLegacyProfile();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const local = readLocalProfile(addr);
      setUsername(local.username ?? "");
      setAvatar(local.avatar);
    });
    return () => {
      cancelled = true;
    };
  }, [addr]);

  // Fall back to the shared row so a profile follows the WALLET rather than
  // the browser that set it: on a new device local storage is empty while
  // every other miner already sees the name. Local always wins, so this can
  // never overwrite an edit in progress.
  useEffect(() => {
    if (!sharedRow) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setUsername((u) => u || (sharedRow.username ?? ""));
      setAvatar((a) => a ?? sharedRow.avatar ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sharedRow]);

  // Dialog keyboard contract (audit): move focus in on open, trap Tab,
  // Escape closes, and focus returns to the opener on close (cleanup).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Mid-edit Escape cancels the EDIT; only a second Escape closes.
        if (editingRef.current) {
          editingRef.current = false;
          setEditing(false);
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
  }, [open, onClose]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

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

  // Shared-profile write-through (Supabase via /api/profile). Fire-and-
  // forget: local state is already saved; a lost write self-heals on the
  // next save. "taken" surfaces inline under the username row.
  const syncRemote = (
    nextUsername: string | null,
    nextAvatar: string | null,
  ) => {
    if (!addr) return;
    invalidateProfile(addr);
    void pushProfile({
      address: addr,
      username: nextUsername,
      avatar: nextAvatar,
      getToken,
    }).then((r) => setNameTaken(r === "taken"));
  };

  const saveUsername = () => {
    if (!addr) return;
    const clean = draft.trim().slice(0, 24);
    setUsername(clean);
    safeSet(usernameKey(addr), clean);
    announceProfileChange();
    setEditing(false);
    syncRemote(clean || null, avatar);
  };

  const onAvatarPick = async (file: File | undefined) => {
    if (!file || !addr) return;
    try {
      const dataUrl = await fileToAvatar(file);
      setAvatar(dataUrl);
      safeSet(avatarKey(addr), dataUrl);
      announceProfileChange();
      syncRemote(username || null, dataUrl);
    } catch {
      // Unreadable file — keep the current avatar.
    }
  };

  const disconnectDiscord = async () => {
    if (!discord) return;
    try {
      // Server first: revoke roles + null the row while the link still
      // exists, THEN unlink from Privy.
      if (address && getToken) {
        const token = await getToken();
        if (token) {
          await fetch("/api/discord/disconnect", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ address }),
          });
        }
      }
      await discord.unlink();
      registeredFor.current = null;
    } catch {
      // Leave the link visible; the user can retry.
    }
  };

  const removeAvatar = () => {
    if (!addr) return;
    setAvatar(null);
    try {
      localStorage.removeItem(avatarKey(addr));
    } catch {
      // Storage blocked — the state reset still clears the session.
    }
    announceProfileChange();
    syncRemote(username || null, null);
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
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL, next/image adds nothing
                <img
                  src={avatar}
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
                void onAvatarPick(file);
              }}
            />
          </span>
        </div>
        {avatar && (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={removeAvatar}
              className="cursor-pointer text-[12px] font-light text-fg-muted transition-colors hover:text-danger"
            >
              Remove photo
            </button>
          </div>
        )}
        {nameTaken && (
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
            {editing ? (
              <span className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveUsername();
                    // Escape is handled by the drawer's document listener
                    // (cancels the edit there — stopPropagation can't work
                    // across same-node listeners; see editingRef above).
                  }}
                  aria-label="Username"
                  className="tnum h-8 w-36 rounded-lg border border-line-slate bg-surface px-2 text-[14px] text-fg outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={saveUsername}
                  className="cursor-pointer text-[13px] font-bold text-accent"
                >
                  Save
                </button>
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="min-w-0 truncate text-[15px] font-semibold text-fg">
                  {username || <span className="text-fg-muted">None</span>}
                </span>
                <button
                  type="button"
                  aria-label="Edit username"
                  onClick={() => {
                    setDraft(username);
                    setEditing(true);
                  }}
                  className="shrink-0 cursor-pointer text-fg-muted transition-colors hover:text-fg"
                >
                  <PencilIcon size={14} />
                </button>
              </span>
            )}
          </Row>
          <Row label="Discord">
            {discord ? (
              discord.username ? (
                <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-fg">
                  <DiscordIcon size={15} className="shrink-0 text-fg-muted" />
                  <span className="min-w-0 truncate">{discord.username}</span>
                  <button
                    type="button"
                    onClick={() => void disconnectDiscord()}
                    className="shrink-0 cursor-pointer text-[12px] font-light text-fg-muted transition-colors hover:text-danger"
                  >
                    Unlink
                  </button>
                </span>
              ) : (
                <span className="flex min-w-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => discord.link()}
                    className="flex h-8 cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-accent px-3 text-[13px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-light"
                  >
                    <DiscordIcon size={15} />
                    Connect
                  </button>
                  {discord.error && (
                    <span role="alert" className="text-[12px] text-danger">
                      {discord.error}
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
