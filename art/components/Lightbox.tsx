"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
} from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { collectionName, type Piece } from "@/lib/content";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-12" -> "12 Jul 2026" without locale APIs (SSR-stable). */
function fmtAdded(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Piece viewer: image + meta, download, copy-link, and prev/next paging
 * (buttons + arrow keys; a dedicated pager row below md where the side
 * arrows are hidden). Downloads keep the source file's extension so the
 * saved file opens on double-click everywhere.
 */
export function Lightbox({
  piece,
  onClose,
  onPrev,
  onNext,
}: {
  piece: Piece;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Plain arrows only: skip held modifiers and any focused form control
      // (the trap keeps focus in the dialog, but the guard costs nothing).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  // Paging to another piece clears the flash AND its pending timer, so a
  // stale timeout can't truncate the next piece's flash.
  useEffect(() => {
    setCopied(false);
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, [piece.id]);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + piece.src);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/insecure context); stay quiet.
    }
  };

  const ext = piece.src.slice(piece.src.lastIndexOf("."));

  return (
    <Modal label={piece.title} onClose={onClose} panelClassName="w-full max-w-[980px]">
      <div className="grid md:grid-cols-[1.5fr_1fr]">
        <div className="flex items-center justify-center bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={piece.src}
            alt={piece.title}
            width={piece.w}
            height={piece.h}
            className="max-h-[46vh] w-full object-contain md:max-h-[70vh]"
          />
        </div>

        <div className="flex flex-col gap-4 p-6 md:p-7">
          <span className="micro-label">{collectionName(piece.collection)}</span>
          <h3 className="text-[20px] font-bold leading-tight text-fg">{piece.title}</h3>
          {piece.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {piece.tags.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-line-faint px-2.5 py-1 text-[11px] font-light text-fg-muted"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
          <p className="tnum text-[12px] font-light text-fg-muted">
            Added {fmtAdded(piece.added)}
          </p>

          <div className="mt-auto flex flex-col gap-2.5 pt-4">
            <a
              href={piece.src}
              download={`${piece.id}${ext}`}
              className="focus-ring flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-bold text-on-light shadow-[0_0_24px_-8px_var(--color-accent)] transition hover:brightness-110"
            >
              <DownloadIcon size={16} />
              Download
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="focus-ring flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-[1.5px] border-line-slate text-[13px] font-semibold text-fg-body transition-colors hover:border-fg-muted hover:text-fg"
            >
              {copied ? (
                <>
                  <CheckIcon size={15} className="text-accent" />
                  Copied
                </>
              ) : (
                "Copy link"
              )}
            </button>
            {/* Screen-reader confirmation for the visual "Copied" flash. */}
            <span aria-live="polite" className="sr-only">
              {copied ? "Link copied" : ""}
            </span>

            {/* Mobile pager: the side arrows below are hidden under md. */}
            <div className="flex gap-2.5 md:hidden">
              <button
                type="button"
                onClick={onPrev}
                className="focus-ring flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line-slate text-[12px] font-semibold text-fg-body transition-colors hover:text-fg"
              >
                <ChevronLeftIcon size={14} />
                Prev
              </button>
              <button
                type="button"
                onClick={onNext}
                className="focus-ring flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line-slate text-[12px] font-semibold text-fg-body transition-colors hover:text-fg"
              >
                Next
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="focus-ring absolute right-3 top-3 flex size-9 cursor-pointer items-center justify-center rounded-full border border-line-slate bg-bg/70 text-fg-muted transition-colors hover:text-fg"
      >
        <CloseIcon size={15} />
      </button>
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous piece"
        className="focus-ring absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line-slate bg-bg/70 text-fg-muted transition-colors hover:text-fg md:flex"
      >
        <ChevronLeftIcon size={17} />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next piece"
        className="focus-ring absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line-slate bg-bg/70 text-fg-muted transition-colors hover:text-fg md:flex"
      >
        <ChevronRightIcon size={17} />
      </button>
    </Modal>
  );
}
