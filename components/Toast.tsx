"use client";

/**
 * Minimal toast stack (integration build 2026-07-16) — confirmations for
 * on-chain txs and per-user SSE events (claims, AutoMiner runs, staking).
 *
 * - `useToast().push({...})` from anywhere under <ToastProvider>.
 * - Fixed bottom-right, newest at the bottom; max 4 (oldest dropped).
 * - Auto-dismiss after 5s; timers tracked and cleared on dismiss/unmount.
 * - `aria-live="polite"` region so screen readers announce pushes.
 * - No portal: position:fixed renders correctly from the provider root.
 */

import { txUrl } from "@/lib/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const DISMISS_MS = 5_000;
/** Pending/again-later messages need longer than a success confirmation. */
const INFO_DISMISS_MS = 10_000;
const MAX_TOASTS = 4;

export type ToastVariant = "success" | "error" | "info";

export interface ToastInput {
  title: string;
  body?: string;
  variant?: ToastVariant;
  /** Shown shortened; becomes an explorer link once an explorer URL exists. */
  txHash?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  push(toast: ToastInput): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const NOOP: ToastApi = { push: () => {} };

/** No-op without a provider — unit tests mount panels bare; the app always
 * has <ToastProvider> at the root (lib/providers.tsx). */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

const RULE: Record<ToastVariant, string> = {
  success: "bg-accent",
  error: "bg-danger",
  info: "bg-line-slate",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...input, id }].slice(-MAX_TOASTS));
      // A failure is the one message a user has to act on: it carries the
      // reason and the transaction hash. Dismissing it after five seconds
      // threw both away before they could be read, let alone clicked.
      // Errors now wait to be dismissed; everything else still clears.
      const ms =
        input.variant === "error"
          ? null
          : input.variant === "info"
            ? INFO_DISMISS_MS
            : DISMISS_MS;
      if (ms !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ms),
        );
      }
    },
    [dismiss],
  );

  // All pending timers die with the provider.
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    },
    [],
  );

  const api = useMemo<ToastApi>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        role="status"
        // Below md the BottomNav is fixed at bottom-0 (h-16 + safe area) and
        // this sits above it at z-60, so every toast covered the nav and the
        // bottom of the page with it. Clears the nav with the same offset the
        // Footer already uses for the same reason.
        className="pointer-events-none fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-[60] flex w-[320px] max-w-[calc(100vw-32px)] flex-col gap-2 md:bottom-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-stretch overflow-hidden rounded-[12px] border border-line-slate bg-panel shadow-lg"
          >
            <span
              aria-hidden
              className={`w-1 shrink-0 ${RULE[t.variant ?? "info"]}`}
            />
            <div className="min-w-0 flex-1 px-3.5 py-3">
              <p className="text-[14px] font-semibold text-fg">{t.title}</p>
              {t.body && (
                <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">
                  {t.body}
                </p>
              )}
              {t.txHash && (
                <a
                  href={txUrl(t.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t.txHash}
                  className="focus-ring tnum mt-1 inline-block rounded-sm text-[11.5px] text-fg-muted underline-offset-2 transition hover:text-accent hover:underline"
                >
                  {`${t.txHash.slice(0, 10)}...${t.txHash.slice(-6)}`}
                </a>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="cursor-pointer self-start p-2.5 text-fg-muted transition-colors hover:text-fg"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
