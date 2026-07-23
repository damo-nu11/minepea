"use client";

/**
 * Agent launcher: a fixed bottom-left button that opens a dialog handing the
 * visitor the skill.md URL (user 2026-07-23).
 *
 * The whole product is that URL. An agent given it can read the protocol,
 * the REST surface and the contract ABI and mine unattended, so the dialog's
 * job is to make the link copyable and say what happens next. There is no
 * wallet connection here on purpose: the agent brings its own.
 *
 * Bottom-LEFT, because bottom-right is the toast stack (Toast.tsx) and a
 * launcher that shares that corner gets covered every round. Below md it
 * clears the fixed BottomNav with the same offset the Footer and the toasts
 * use, so it can never sit on top of the nav.
 *
 * Dialog contract is ProfilePanel's, deliberately: portal, focus moves in on
 * open, Tab is trapped, Escape closes, focus returns to the opener, and the
 * page behind is scroll-locked.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AgentIcon, CheckIcon, CopyIcon } from "@/components/icons";

const SKILL_URL = "https://www.minepea.com/skill.md";

const CAPABILITIES = [
  "Pick tiles and deploy ETH every round without you lifting a finger",
  "Run any strategy: spread wide, concentrate, or react to the board",
  "Read round outcomes over SSE and adjust its approach as it goes",
  "Accumulate ETH winnings and PEA rewards autonomously",
];

export function AgentFab() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transient state must not survive a close/reopen — adjust during render,
  // since effect cleanup runs post-paint and would show one stale frame.
  if (!open && copied) setCopied(false);

  // Dialog keyboard contract: focus in on open, trap Tab, Escape closes,
  // focus returns to the opener on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [open]);

  // Scroll-lock the page behind the dialog.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Tracked timer: cleared on re-click and on unmount.
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copy = () => {
    void navigator.clipboard?.writeText(SKILL_URL).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <>
      {/* Launcher. Bottom-left; clears the BottomNav below md. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Deploy a mining agent"
        className="focus-ring fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-4 z-50 flex size-12 cursor-pointer items-center justify-center rounded-full border border-accent/40 bg-surface text-accent shadow-[0_0_24px_-8px_var(--color-accent)] transition hover:border-accent hover:bg-accent hover:text-on-light md:bottom-5 md:left-5"
      >
        <AgentIcon size={22} />
      </button>

      {/* Same portal guard Tooltip uses: no mount state, so no setState in an
          effect and no cascading render. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[70]">
            {/* Backdrop: non-focusable (an extra tab stop otherwise); the ✕
                and Escape are the keyboard paths. */}
            <div
              aria-hidden
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="agent-dialog-title"
              className="glass-pane absolute left-1/2 top-1/2 flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-[18px] px-6 py-6 scroll-slim"
            >
              <div className="flex items-start gap-3.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] border border-accent/30 bg-accent/[0.07] text-accent">
                  <AgentIcon size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    id="agent-dialog-title"
                    className="text-[19px] font-extrabold leading-tight text-fg"
                  >
                    Deploy a Mining Agent
                  </h2>
                  <p className="mt-0.5 text-[13.5px] text-fg-muted">
                    Automate your PEA mining with an AI agent
                  </p>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="focus-ring -mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-fg-muted transition hover:text-fg"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M3 3l10 10M13 3L3 13"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <p className="mt-5 text-[13.5px] leading-relaxed text-fg-body">
                Give your agent this URL. It contains everything it needs to
                start mining:
              </p>

              <div className="mt-2.5 flex items-stretch gap-2">
                <code className="tnum min-w-0 flex-1 truncate rounded-[11px] border border-line-slate bg-black/40 px-3.5 py-3 text-[13px] text-fg">
                  {SKILL_URL}
                </code>
                <button
                  type="button"
                  onClick={copy}
                  aria-label={copied ? "Copied" : "Copy agent URL"}
                  className="focus-ring flex w-12 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-accent/40 bg-accent/[0.07] text-accent transition hover:bg-accent hover:text-on-light"
                >
                  {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                </button>
              </div>
              {/* Announced separately: the icon swap alone is invisible to AT. */}
              <span aria-live="polite" className="sr-only">
                {copied ? "Agent URL copied to clipboard" : ""}
              </span>

              <div className="mt-4 rounded-[13px] border border-line-slate bg-white/[0.02] px-4 py-3.5">
                <p className="text-[13px] font-bold text-fg">
                  Once deployed, your agent can:
                </p>
                <ul className="mt-2.5 flex flex-col gap-2">
                  {CAPABILITIES.map((c) => (
                    <li
                      key={c}
                      className="flex gap-2.5 text-[13px] leading-relaxed text-fg-body"
                    >
                      <span aria-hidden className="text-accent">
                        -
                      </span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href="/skill.md"
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-[13px] border border-accent/50 bg-accent/[0.06] py-3.5 text-[14px] font-bold text-fg transition hover:bg-accent hover:text-on-light"
              >
                Open Agent Docs
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M5 2h7v7M12 2L4 10M9 12H2V5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
