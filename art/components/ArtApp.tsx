"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandKit } from "@/components/BrandKit";
import { Collections } from "@/components/Collections";
import { Gallery, type Filter, type Sort } from "@/components/Gallery";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Lightbox } from "@/components/Lightbox";
import { SiteFooter } from "@/components/SiteFooter";
import { PIECES, type CollectionId, type Piece } from "@/lib/content";
import { seededShuffle } from "@/lib/rng";

/**
 * Client root: all page state lives here (collection filter, sort,
 * lightbox) and flows down as props.
 *
 * Hydration safety: the initial Random order uses a CONSTANT seed so the
 * server and first client render agree; picking Random in the sort control
 * re-seeds from the click timestamp, which only ever runs client-side.
 */
const INITIAL_SEED = 7;

export function ArtApp() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("random");
  const [seed, setSeed] = useState(INITIAL_SEED);
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const filtered = PIECES.filter(
      (p) => filter === "all" || p.collection === filter,
    );
    if (sort === "latest")
      return [...filtered].sort((a, b) => b.added.localeCompare(a.added));
    if (sort === "oldest")
      return [...filtered].sort((a, b) => a.added.localeCompare(b.added));
    return seededShuffle(filtered, seed);
  }, [filter, sort, seed]);

  const openIndex = visible.findIndex((p) => p.id === openId);
  const openPiece: Piece | null = openIndex >= 0 ? visible[openIndex] : null;

  // If the open piece leaves the visible set (filter/search changed under an
  // open lightbox), drop the id NOW via the adjust-state-during-render
  // pattern (same as the main app's reveal state machine) so the lightbox
  // can't spontaneously reopen when the piece re-enters the results.
  if (openId !== null && openIndex < 0) {
    setOpenId(null);
  }

  const scrollToArt = () => {
    const el = document.getElementById("art");
    // No behavior option: defers to the CSS scroll-behavior, which is
    // smooth normally and auto under prefers-reduced-motion (globals.css).
    el?.scrollIntoView();
    // Move keyboard focus with the view so Tab continues from the grid.
    (el as HTMLElement | null)?.focus({ preventScroll: true });
  };

  const pickCollection = (id: CollectionId) => {
    setFilter(id);
    scrollToArt();
  };

  const reshuffle = () => setSeed(Date.now() % 0xffffffff);

  const onSort = (next: Sort) => {
    // Fresh seed when entering Random; the visible Shuffle button covers
    // re-rolls (a native select fires no change event when the already
    // selected option is picked again).
    if (next === "random") reshuffle();
    setSort(next);
  };

  const step = (dir: 1 | -1) => {
    if (openIndex < 0 || visible.length === 0) return;
    const next = (openIndex + dir + visible.length) % visible.length;
    setOpenId(visible[next].id);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Hero onExplore={scrollToArt} />
        <Collections onPick={pickCollection} />
        <Gallery
          pieces={visible}
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={onSort}
          onShuffle={reshuffle}
          onOpen={(p) => setOpenId(p.id)}
        />
        <BrandKit />
      </main>
      <SiteFooter />

      {openPiece && (
        <Lightbox
          piece={openPiece}
          onClose={() => setOpenId(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      )}
    </div>
  );
}
