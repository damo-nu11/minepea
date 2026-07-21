"use client";

/**
 * Tooltip primitive (Convention 5). Pairs with the `dashed-underline` utility:
 * any dashed-underlined label wraps in <Tooltip>.
 *
 * The panel renders through a PORTAL with viewport clamping (visual pass
 * 2026-07-12): ancestor overflow containers (e.g. the Mine sidebar) were
 * clipping edge tooltips — a portal cannot be clipped, and the clamp keeps
 * the bubble fully on screen at any trigger position. Placement is above
 * and to the right of the trigger; flips below when there is no room above.
 *
 * Accessibility (audit r1–r3): hover + focus tracked separately; Escape
 * dismisses in every show mode (WCAG 1.4.13); visible focus ring;
 * `focusableChild` skips the wrapper tab stop and moves aria-describedby
 * onto the child control; `label` names icon-only triggers.
 */

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 8;

export function Tooltip({
  content,
  children,
  className,
  focusableChild = false,
  label,
}: {
  content: string;
  children: React.ReactNode;
  className?: string;
  /** True when the child is itself focusable (button/a) — no wrapper tab stop. */
  focusableChild?: boolean;
  /** Accessible name for icon-only triggers. */
  label?: string;
}) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);

  const engaged = hovered || focused;
  const visible = engaged && !dismissed;

  // Escape dismisses while visible, regardless of where focus is (1.4.13).
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible]);

  // Position the portal panel: above and to the RIGHT of the trigger (user
  // direction 2026-07-13 — centered-above covered the grid from the sidebar
  // labels), clamped to the viewport, flipped below when there is no
  // headroom. Positions by direct style mutation (no state) — runs before
  // paint, so no flash and no setState-in-effect cascade.
  useLayoutEffect(() => {
    if (!visible) return;
    const trigger = wrapRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const r = trigger.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let left = r.right + 6;
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - VIEWPORT_MARGIN - pw),
    );
    let top = r.top - ph - 6;
    if (top < VIEWPORT_MARGIN) top = r.bottom + 6;
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }, [visible, content]);

  // Describe the real control: the child when it's the focusable element.
  const child =
    focusableChild && isValidElement(children)
      ? cloneElement(
          children as React.ReactElement<{ "aria-describedby"?: string }>,
          { "aria-describedby": id },
        )
      : children;

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg/70 ${className ?? ""}`}
      tabIndex={focusableChild ? undefined : 0}
      aria-label={label}
      aria-describedby={focusableChild ? undefined : id}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false);
        if (!focused) setDismissed(false);
      }}
      onFocus={(e) => {
        // Keyboard focus only (:focus-visible): a mouse click also focuses
        // the trigger, which pinned the tooltip open after clicking a label
        // — clicks must not latch it (user direction 2026-07-13).
        setFocused(e.currentTarget.matches(":focus-visible"));
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocused(false);
          if (!hovered) setDismissed(false);
        }
      }}
    >
      {child}
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={panelRef}
            id={id}
            role="tooltip"
            style={{ top: -9999, left: -9999 }}
            className="pointer-events-none fixed z-50 w-max max-w-56 rounded-lg border border-line-slate bg-surface px-3 py-2 text-xs font-normal normal-case tracking-normal text-fg-body"
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
