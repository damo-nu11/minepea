"use client";

import { useEffect, useRef } from "react";
import { PIECES } from "@/lib/content";

/**
 * Hero: dot-matrix backdrop, a soft accent bloom, six drifting art tiles
 * around a centered headline. Tiles are decorative duplicates of gallery
 * pieces (aria-hidden); the real grid below is the interactive surface.
 */
const TILES: {
  src: string;
  className: string;
  tilt: string;
  delay: string;
}[] = [
  {
    src: "/art/sample-grid-strike.svg",
    className: "left-[4%] top-[8%] w-40 xl:w-48 hidden lg:block",
    tilt: "-7deg",
    delay: "0s",
  },
  {
    src: "/art/sample-volt.svg",
    className: "left-[10%] bottom-[6%] w-32 xl:w-40 hidden lg:block",
    tilt: "5deg",
    delay: "1.4s",
  },
  {
    src: "/art/sample-crescent.svg",
    className: "right-[5%] top-[10%] w-36 xl:w-44 hidden md:block",
    tilt: "6deg",
    delay: "0.7s",
  },
  {
    src: "/art/sample-signal-rings.svg",
    className: "right-[12%] bottom-[8%] w-36 xl:w-44 hidden md:block",
    tilt: "-5deg",
    delay: "2.1s",
  },
  {
    src: "/art/sample-up-only.svg",
    className: "left-[24%] top-[4%] w-32 hidden xl:block",
    tilt: "3deg",
    delay: "2.8s",
  },
  {
    src: "/art/sample-halftone.svg",
    className: "right-[26%] top-[2%] w-24 hidden xl:block",
    tilt: "-4deg",
    delay: "3.5s",
  },
];

/** Hairline cell + brighter major rule every 4th line, both token-derived. */
const GRID_LINE = "var(--color-line-faint)";
const GRID_MAJOR = "color-mix(in srgb, var(--color-line-slate) 55%, transparent)";
const CELL = 64;

export function Hero({ onExplore }: { onExplore: () => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  // Scroll parallax: the grid drifts at a fraction of scroll speed
  // (transform-only, rAF-coalesced). Skipped entirely under
  // prefers-reduced-motion; the static grid remains.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        gridRef.current?.style.setProperty(
          "transform",
          `translate3d(0, ${window.scrollY * 0.22}px, 0)`,
        );
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  // Cursor glow: a soft accent light follows the pointer across the grid.
  // Hidden until the first move (so SSR/touch render only the static bloom).
  const onPointerMove = (e: React.PointerEvent) => {
    const glow = glowRef.current;
    const bounds = sectionRef.current?.getBoundingClientRect();
    if (!glow || !bounds) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    glow.style.opacity = "1";
    glow.style.transform = `translate3d(${e.clientX - bounds.left - 260}px, ${
      e.clientY - bounds.top - 260
    }px, 0)`;
  };

  return (
    <section
      id="top"
      ref={sectionRef}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        if (glowRef.current) glowRef.current.style.opacity = "0";
      }}
      className="relative overflow-hidden px-4 pb-24 pt-20 md:pb-32 md:pt-28"
    >
      {/* Mining-grid ground (replaces the dot matrix, user 2026-07-17):
          1px hairline cells + a brighter rule every 4th line, faded out
          toward the edges, parallax-shifted on scroll. Oversized bleed so
          the shift never exposes an edge. */}
      <div
        ref={gridRef}
        aria-hidden
        className="absolute -inset-x-4 -top-48 -bottom-80 will-change-transform"
        style={{
          backgroundImage: [
            `repeating-linear-gradient(0deg, ${GRID_LINE} 0 1px, transparent 1px ${CELL}px)`,
            `repeating-linear-gradient(90deg, ${GRID_LINE} 0 1px, transparent 1px ${CELL}px)`,
            `repeating-linear-gradient(0deg, ${GRID_MAJOR} 0 1px, transparent 1px ${CELL * 4}px)`,
            `repeating-linear-gradient(90deg, ${GRID_MAJOR} 0 1px, transparent 1px ${CELL * 4}px)`,
          ].join(", "),
          maskImage:
            "radial-gradient(130% 95% at 50% 38%, black 35%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(130% 95% at 50% 38%, black 35%, transparent 80%)",
        }}
      />
      {/* Static accent bloom behind the headline. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(640px circle at 50% 32%, color-mix(in srgb, var(--color-accent) 7%, transparent), transparent 70%)",
        }}
      />
      {/* Pointer-following glow, lighting the grid cells near the cursor. */}
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 size-[520px] opacity-0 transition-[transform,opacity] duration-300 ease-out will-change-transform"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 62%)",
        }}
      />

      {TILES.map((t) => (
        <div
          key={t.src}
          aria-hidden
          className={`hero-drift absolute overflow-hidden rounded-[10px] border border-line-slate shadow-[0_0_28px_-12px_var(--color-accent)] ${t.className}`}
          style={{ "--tilt": t.tilt, animationDelay: t.delay } as React.CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} alt="" className="block h-auto w-full" />
        </div>
      ))}

      <div className="relative mx-auto flex max-w-[760px] flex-col items-center text-center">
        <span className="micro-label">PEA art</span>
        <h1 className="mt-5 text-[40px] font-bold leading-[1.04] tracking-[-0.02em] text-fg md:text-[64px]">
          Straight from the <span className="text-accent">mine.</span>
        </h1>
        <p className="mt-6 max-w-[560px] text-[15px] leading-relaxed text-fg-body md:text-[17px]">
          Official PEA art, memes, GIFs, and brand assets. Free to take,
          remix, and post.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onExplore}
            className="focus-ring h-[46px] cursor-pointer rounded-full border-[1.5px] border-accent px-7 text-[14px] font-semibold text-accent transition-colors hover:bg-accent hover:text-on-light"
          >
            Explore the art
          </button>
          <a
            href="#brandkit"
            className="focus-ring flex h-[46px] cursor-pointer items-center rounded-full border-[1.5px] border-line-slate px-7 text-[14px] font-semibold text-fg-body transition-colors hover:border-fg-muted hover:text-fg"
          >
            Brand kit
          </a>
        </div>
        <p className="tnum mt-7 text-[12px] font-light text-fg-muted">
          {PIECES.length} pieces and counting
        </p>
      </div>
    </section>
  );
}
