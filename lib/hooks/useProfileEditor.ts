"use client";

/**
 * Shared profile-editing seam (extracted from ProfilePanel for the /profile
 * page, 2026-07-30 — plan reference/profile-plan.md P0). ONE hook owns the
 * identity state and every mutation, so the drawer and the full page can
 * never drift: both mount it, and a save on either surface re-syncs the
 * other through PROFILE_CHANGED_EVENT (the always-mounted drawer used to
 * re-read only on address change, so a page-side save would have left it
 * stale — audit finding, fixed here by construction).
 *
 * Behavior is the panel's, moved verbatim: per-wallet lowercased keys, the
 * deferred local read on address change, shared-row fallback (local always
 * wins), guarded storage writes, fire-and-forget remote push with 409
 * "taken" surfacing, Privy-native Discord link/unlink with server-first
 * revoke, and the idempotent register POST — now deduped at MODULE scope
 * because two surfaces mounting the hook must not double-post.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  announceProfileChange,
  avatarKey,
  invalidateProfile,
  PROFILE_CHANGED_EVENT,
  purgeLegacyProfile,
  pushProfile,
  readLocalProfile,
  usernameKey,
  useProfiles,
} from "@/lib/profile";
import { useAccessToken, useDiscord, useWallet } from "@/lib/walletContext";

export const AVATAR_SIZE = 128;

/** Longest username we keep. Both the save clamp below and the inputs'
 * maxLength read THIS: when only the clamp enforced it, the field happily
 * accepted 60 characters, showed all 60, and silently dropped 36 on save. */
export const USERNAME_MAX = 24;

/** localStorage that never throws (blocked storage / quota — audit). */
export function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked or quota-exceeded — the value lives for this session only.
  }
}

/** File → square-cropped, downscaled JPEG data URL (localStorage-sized). */
export function fileToAvatar(file: File): Promise<string> {
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

/** One register POST per (address, discordUsername) across ALL mounted
 * surfaces — the route is idempotent but two mounts must not double-post. */
const registeredProfiles = new Set<string>();

export function useProfileEditor() {
  const { address } = useWallet();
  // Storage keys and shared rows are both lowercased — one normalisation
  // point so a checksummed address can never read a key it did not write.
  const addr = address?.toLowerCase() ?? null;
  const sharedRow = useProfiles(addr ? [addr] : []).get(addr ?? "");
  const getToken = useAccessToken();
  const discord = useDiscord();

  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  /** Shared-profile write rejected: username already taken (409). */
  const [nameTaken, setNameTaken] = useState(false);
  /** Set while the user is framing a freshly picked photo. */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /** Live mirror of the connected address, for guarding async applies
   * against an identity change mid-flight (synced in an effect — a ref
   * written during render is impure). */
  const addrRef = useRef(addr);
  useEffect(() => {
    addrRef.current = addr;
  }, [addr]);

  // Reset the edit buffer the moment the wallet changes, DURING RENDER
  // (the house pattern). Left open across a switch, saveUsername wrote
  // wallet A's name into wallet B's key and published it to B's shared
  // row — the bug class per-wallet namespacing exists to prevent.
  const [bufferAddr, setBufferAddr] = useState(addr);
  if (bufferAddr !== addr) {
    setBufferAddr(addr);
    setEditing(false);
    setDraft("");
    setNameTaken(false);
    setPendingFile(null);
  }

  // localStorage only after mount (Convention 7 — hydration safety),
  // guarded, keyed on the ADDRESS (the browser-global-key bug class is
  // test-pinned). Deferred: a synchronous setState in an effect body
  // cascades renders. ALSO re-reads on PROFILE_CHANGED_EVENT + storage so
  // a save on the other surface (page vs drawer) lands here immediately.
  useEffect(() => {
    purgeLegacyProfile();
    let cancelled = false;
    const read = () => {
      const local = readLocalProfile(addr);
      setUsername(local.username ?? "");
      setAvatar(local.avatar);
    };
    queueMicrotask(() => {
      if (!cancelled) read();
    });
    window.addEventListener(PROFILE_CHANGED_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_CHANGED_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [addr]);

  // Fall back to the shared row so a profile follows the WALLET rather
  // than the browser that set it. Local always wins, so this can never
  // overwrite an edit in progress.
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

  // Discord link registration (Supabase social_connections + community
  // roles): idempotent, server-verified, doubles as an on-demand role
  // refresh. Module-scope dedupe (see registeredProfiles).
  const discordUsername = discord?.username ?? null;
  useEffect(() => {
    if (!discordUsername || !address || !getToken) return;
    const key = `${address}:${discordUsername}`;
    if (registeredProfiles.has(key)) return;
    registeredProfiles.add(key);
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
        // Registration is additive; a failed attempt retries next mount.
        registeredProfiles.delete(key);
      });
  }, [discordUsername, address, getToken]);

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

  // STABLE identities. These are consumed in the drawer's dialog-effect
  // deps; as fresh arrows they re-ran that effect on every render, whose
  // cleanup/setup pair moved focus to the close button — so typing in the
  // username field lost focus after one character (regression found by
  // audit 2026-07-30, introduced by this extraction).
  const startEdit = useCallback(() => {
    setDraft(username);
    setEditing(true);
  }, [username]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft("");
  }, []);

  const saveUsername = () => {
    if (!addr) return;
    const clean = draft.trim().slice(0, USERNAME_MAX);
    setUsername(clean);
    safeSet(usernameKey(addr), clean);
    announceProfileChange();
    setEditing(false);
    syncRemote(clean || null, avatar);
  };

  /** A pick no longer saves straight away: it opens the cropper, and the
   * cropped result comes back through applyAvatar. */
  const onAvatarPick = (file: File | undefined) => {
    if (!file || !addr) return;
    setPendingFile(file);
  };

  const cancelAvatarCrop = useCallback(() => setPendingFile(null), []);

  const applyAvatar = (dataUrl: string) => {
    setPendingFile(null);
    // The crop can outlast a wallet switch; without this the new photo
    // lands on the OLD wallet's key and shared row.
    if (!addr || addrRef.current !== addr) return;
    setAvatar(dataUrl);
    safeSet(avatarKey(addr), dataUrl);
    announceProfileChange();
    syncRemote(username || null, dataUrl);
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
      if (discordUsername && address)
        registeredProfiles.delete(`${address}:${discordUsername}`);
    } catch {
      // Leave the link visible; the user can retry.
    }
  };

  return {
    address,
    addr,
    username,
    avatar,
    nameTaken,
    editing,
    draft,
    setDraft,
    startEdit,
    cancelEdit,
    saveUsername,
    onAvatarPick,
    pendingFile,
    applyAvatar,
    cancelAvatarCrop,
    removeAvatar,
    discord,
    disconnectDiscord,
  };
}
