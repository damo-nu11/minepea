"use client";

import { COLLECTIONS, collectionCount, type CollectionId } from "@/lib/content";

/**
 * The six lanes. Picking a card filters the gallery below and scrolls to it;
 * counts derive from the manifest so they can never drift from the grid.
 */
export function Collections({ onPick }: { onPick: (id: CollectionId) => void }) {
  return (
    <section id="collections" className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-20">
      <div className="flex flex-col items-center text-center">
        <span className="micro-label">The collections</span>
        <h2 className="mt-3 text-[28px] font-bold tracking-[-0.01em] text-fg md:text-[34px]">
          Pick a collection<span className="text-accent">.</span>
        </h2>
        <p className="mt-3 max-w-[520px] text-[14px] text-fg-muted">
          Official drops, memes, loops, and 3D. Every collection is free to
          browse and save from.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {COLLECTIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            className="focus-ring group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[16px] border border-line-slate text-left transition-colors hover:border-accent/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.cover}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-300 group-hover:scale-[1.04] group-hover:opacity-100"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <h3 className="text-[18px] font-bold text-fg">{c.name}</h3>
              <p className="mt-1 text-[12px] font-light text-fg-body">{c.blurb}</p>
              <span className="tnum mt-3 inline-block rounded-full border border-accent/40 bg-black/60 px-2.5 py-1 text-[11px] text-accent">
                {collectionCount(c.id)} pieces
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
