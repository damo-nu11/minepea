"use client";

/**
 * /brand — the PEA brand kit (2026-07-28, user-directed shell pass;
 * audit-hardened same day).
 *
 * Structure mirrors the classic protocol brand page (colors, marks, FAQ);
 * every sentence is original PEA copy per the hard rules. Mock/live
 * honesty applies to DOWNLOADS: a pill is a real download only when the
 * file exists in public/ today (coin PNG, wordmark SVG); everything else
 * renders as a disabled Soon pill until the user supplies the asset drop
 * (transparent variants, lockup files, palette sheets). Swatch hexes are
 * DATA (display + copy) pinned against app/globals.css by test; the
 * swatch fills themselves use token utilities.
 *
 * Copy honesty: "Copied" renders only after a copy METHOD confirmed
 * success. The modern clipboard API needs a secure context (LAN-IP phone
 * testing is not one), so a legacy textarea fallback runs first when the
 * API is absent or rejects, and a confirmed miss shows "Copy failed",
 * never silence and never a false claim.
 */

import { useEffect, useRef, useState } from "react";
import { ChartCard } from "@/components/explore/shared";
import { DownloadIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";

/** Pinned against app/globals.css in pages.smoke.test.tsx (the palette
 * has re-themed before; drift here hands partners the wrong colors).
 * Coral (#FF5C5C) is deliberately absent (user 2026-07-28): it is a
 * functional UI state (timer digits, negative price moves), not brand
 * identity. */
export const SWATCHES = [
  { name: "Black", hex: "#000000", cls: "bg-bg" },
  { name: "Lime", hex: "#CCFF00", cls: "bg-accent" },
  { name: "White", hex: "#FFFFFF", cls: "bg-fg" },
  { name: "Surface", hex: "#0A0B05", cls: "bg-surface" },
  { name: "Body", hex: "#B9BDAE", cls: "bg-fg-body" },
  { name: "Muted", hex: "#767D6C", cls: "bg-fg-muted" },
  { name: "Hairline", hex: "#2E3A00", cls: "bg-line-slate" },
] as const;

/** Real download: the lime-outline pill that fills on hover (CTA rule).
 * `sr` names the asset for the links list ("PNG" alone is ambiguous). */
function DownloadPill({
  href,
  label,
  sr,
}: {
  href: string;
  label: string;
  sr: string;
}) {
  return (
    <a
      href={href}
      download
      aria-label={sr}
      className="focus-ring flex h-8 items-center gap-1.5 rounded-full border border-accent px-3.5 text-[12px] font-bold text-accent transition-colors hover:bg-accent hover:text-on-light focus-visible:bg-accent focus-visible:text-on-light"
    >
      <DownloadIcon size={13} />
      {label}
    </a>
  );
}

/** Preview tile. Dark surface by default (black-first brand); `light`
 * renders the white tile the light-background variants live on — the
 * variant IS the message, so each previews on its own ground. */
function PreviewTile({
  light = false,
  children,
}: {
  light?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-h-[176px] items-center justify-center rounded-[12px] border border-line-slate/60 px-6 py-10 ${
        light ? "bg-fg" : "bg-surface"
      }`}
    >
      {children}
    </div>
  );
}

/** One variant of a mark: its tile, a ground label, and its downloads. */
function VariantBlock({
  label,
  pills,
  light = false,
  children,
}: {
  label: string;
  pills: React.ReactNode;
  light?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <PreviewTile light={light}>{children}</PreviewTile>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="micro-label">{label}</span>
        <span className="flex items-center gap-2">{pills}</span>
      </div>
    </div>
  );
}

/** Usage rules as Q&A (user 2026-07-28: an FAQ, not the standard
 * Do/Don't/Sizes triple every protocol brand page runs). */
function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-t border-line-slate/50 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[15px] font-bold text-fg">{q}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-fg-body">{a}</p>
    </div>
  );
}

/** Pre-clipboard-API copy for insecure contexts (LAN-IP testing). */
function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function BrandPage() {
  const [copyState, setCopyState] = useState<{
    name: string;
    hex: string;
    ok: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copyHex = async (name: string, hex: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(hex);
      ok = true;
    } catch {
      ok = legacyCopy(hex);
    }
    if (!alive.current) return;
    setCopyState({ name, hex, ok });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (alive.current) setCopyState(null);
    }, 1500);
  };

  return (
    <div className="mx-auto w-full max-w-[920px] px-6 pt-14">
      <PageHeader
        title="Brand"
        subtitle="The official PEA colors and marks, and the rules for using them."
      />

      <div className="mt-10 flex flex-col gap-6 pb-6">
        <ChartCard title="Colors" headingAs="h2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SWATCHES.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => copyHex(s.name, s.hex)}
                aria-label={`Copy ${s.name} ${s.hex}`}
                className="focus-ring group cursor-pointer rounded-[10px] text-left"
              >
                <span
                  className={`block h-20 w-full rounded-[10px] border border-line-slate/60 transition-transform group-hover:scale-[1.02] group-focus-visible:scale-[1.02] motion-reduce:transition-none ${s.cls}`}
                />
                <span className="mt-2 block text-[13.5px] font-bold text-fg">
                  {s.name}
                </span>
                <span className="tnum block text-[12px] text-fg-body transition-colors group-hover:text-fg group-focus-visible:text-fg">
                  {copyState?.name === s.name
                    ? copyState.ok
                      ? "Copied"
                      : "Copy failed"
                    : s.hex}
                </span>
              </button>
            ))}
          </div>
          <p aria-live="polite" className="sr-only">
            {copyState
              ? copyState.ok
                ? `Copied ${copyState.hex}`
                : "Copy failed"
              : ""}
          </p>
          <p className="mt-4 text-[12.5px] text-fg-muted">
            Tap or click a color to copy its hex value.
          </p>
        </ChartCard>

        {/* "Coin" is the project's own name for the round mark
            (icons.tsx: "the brand coin"); the FAQ sizes "the coin", so
            the section must use the same word. */}
        {/* No vector source exists for the 3D coin render (user
            2026-07-29), so the coin and lockup are PNG-only by design,
            never a Soon promise that cannot be kept. */}
        <ChartCard
          title="Coin"
          headingAs="h2"
          actions={
            <DownloadPill
              href="/pea-logo.png"
              label="PNG"
              sr="Download the coin as PNG"
            />
          }
        >
          <PreviewTile>
            {/* Raw img, deliberately not PeaIcon: this preview IS the
                downloadable artifact and carries an informative alt,
                while PeaIcon is aria-hidden chrome. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset preview */}
            <img
              src="/pea-logo.png"
              alt="The PEA coin"
              width={500}
              height={500}
              className="h-28 w-28"
            />
          </PreviewTile>
        </ChartCard>

        <ChartCard title="Wordmark" headingAs="h2">
          <div className="grid gap-5 sm:grid-cols-2">
            <VariantBlock
              label="For dark backgrounds"
              pills={
                <>
                  <DownloadPill
                    href="/pea-wordmark.png"
                    label="PNG"
                    sr="Download the wordmark for dark backgrounds as PNG"
                  />
                  <DownloadPill
                    href="/pea-wordmark.svg"
                    label="SVG"
                    sr="Download the wordmark for dark backgrounds as SVG"
                  />
                </>
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset preview */}
              <img
                src="/pea-wordmark.svg"
                alt="The PEA wordmark for dark backgrounds"
                width={2943}
                height={1240}
                className="h-14 w-auto sm:h-20"
              />
            </VariantBlock>
            <VariantBlock
              light
              label="For light backgrounds"
              pills={
                <>
                  <DownloadPill
                    href="/pea-wordmark-light-bg.png"
                    label="PNG"
                    sr="Download the wordmark for light backgrounds as PNG"
                  />
                  <DownloadPill
                    href="/pea-wordmark-light-bg.svg"
                    label="SVG"
                    sr="Download the wordmark for light backgrounds as SVG"
                  />
                </>
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset preview */}
              <img
                src="/pea-wordmark-light-bg.svg"
                alt="The PEA wordmark for light backgrounds"
                width={2943}
                height={1240}
                className="h-14 w-auto sm:h-20"
              />
            </VariantBlock>
          </div>
        </ChartCard>

        <ChartCard title="Lockup" headingAs="h2">
          {/* Both tiles preview the ACTUAL downloadable file. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <VariantBlock
              label="For dark backgrounds"
              pills={
                <DownloadPill
                  href="/pea-lockup.png"
                  label="PNG"
                  sr="Download the lockup for dark backgrounds as PNG"
                />
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset preview */}
              <img
                src="/pea-lockup.png"
                alt="The PEA lockup for dark backgrounds: the coin beside the wordmark"
                width={1600}
                height={500}
                className="h-12 w-auto sm:h-16"
              />
            </VariantBlock>
            <VariantBlock
              light
              label="For light backgrounds"
              pills={
                <DownloadPill
                  href="/pea-lockup-light-bg.png"
                  label="PNG"
                  sr="Download the lockup for light backgrounds as PNG"
                />
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset preview */}
              <img
                src="/pea-lockup-light-bg.png"
                alt="The PEA lockup for light backgrounds: the coin beside the wordmark"
                width={1600}
                height={500}
                className="h-12 w-auto sm:h-16"
              />
            </VariantBlock>
          </div>
        </ChartCard>

        <ChartCard title="FAQ" headingAs="h2">
          <div className="flex flex-col gap-4">
            <FaqItem
              q="Can I restyle the marks?"
              a="No. Ship them exactly as downloaded. Leave the colors alone, add nothing on top, and keep every mark whole, upright, and unstretched."
            />
            <FaqItem
              q="How much room do the marks need?"
              a="Give each mark a margin no thinner than half its own height, all the way around. Floors: the coin at 16px, the wordmark at 20px tall, the lockup at 28px tall."
            />
            <FaqItem
              q="Which file goes on which background?"
              a="White lettered marks go on dark backgrounds, black lettered ones on light. The coin holds on both. Pick whichever keeps the mark clearly legible where it sits."
            />
            <FaqItem
              q="Can I use PEA's marks alongside my own?"
              a="Anything that presents PEA as a partner, backer, or affiliate needs a real agreement first. When in doubt, ask on X."
            />
            <FaqItem
              q="What should the marks link to?"
              a="minepea.com, wherever they appear."
            />
            <FaqItem
              q="What happens when the assets update?"
              a="This page carries the current files. Swap yours out and retire the old copies."
            />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
