"use client";

import { useEffect, useRef } from "react";

/**
 * Shared dialog shell: backdrop, Escape, focus trap, focus restore, body
 * scroll lock, and press-origin backdrop close. Both the lightbox and the
 * submit dialog ride on this so the behaviors can't drift apart.
 *
 * Audit-hardened (2026-07-17):
 * - Real focus trap: Tab wraps inside the panel, so keyboard users can't
 *   reach the aria-modal-hidden page behind (which also made stacked
 *   modals reachable).
 * - Focus restore: the element that opened the dialog is refocused on
 *   close, matching the main app's ProfilePanel behavior.
 * - Mount-only effect keyed on nothing: paging the lightbox re-renders
 *   with fresh callback identities, which must NOT re-run focus/lock.
 *   Escape reads onClose through a ref instead.
 * - Re-entrant scroll lock (module counter) so sibling dialogs can't
 *   wedge body overflow.
 * - Backdrop closes only when the press STARTED on it: a text-selection
 *   drag that releases over the backdrop keeps the dialog open.
 */

let lockCount = 0;
let savedOverflow = "";
function lockScroll() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}
function unlockScroll() {
  lockCount -= 1;
  if (lockCount === 0) document.body.style.overflow = savedOverflow;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({
  label,
  onClose,
  panelClassName,
  children,
}: {
  label: string;
  onClose: () => void;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    lockScroll();
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      // offsetParent filters display:none controls (e.g. the lightbox's
      // desktop-only pager arrows on mobile).
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (active && !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
      opener?.focus();
    };
    // Mount-only by design; Escape reaches the latest onClose via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`focus-ring relative overflow-hidden rounded-[16px] border border-line-slate bg-surface ${panelClassName ?? ""}`}
      >
        {children}
      </div>
    </div>
  );
}
