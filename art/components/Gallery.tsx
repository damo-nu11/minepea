"use client";

import { Dropdown } from "@/components/Dropdown";
import {
  COLLECTIONS,
  collectionName,
  type CollectionId,
  type Piece,
} from "@/lib/content";

export type Filter = "all" | CollectionId;
export type Sort = "random" | "latest" | "oldest";

/**
 * The art grid: collection chips + sort + a CSS-columns masonry. Every card is
 * a real button (keyboard reachable) opening the lightbox; width/height on
 * the img reserve layout so the masonry doesn't jump as images stream in.
 */
export function Gallery({
  pieces,
  filter,
  onFilter,
  sort,
  onSort,
  onShuffle,
  onOpen,
}: {
  pieces: Piece[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  onShuffle: () => void;
  onOpen: (p: Piece) => void;
}) {
  return (
    // tabIndex -1: in-page nav (hero CTA, collection cards) moves keyboard
    // focus here along with the scroll.
    <section
      id="art"
      tabIndex={-1}
      className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-16 outline-none md:px-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-bold tracking-[-0.01em] text-fg md:text-[34px]">
            The art<span className="text-accent">.</span>
          </h2>
          <p className="mt-2 text-[14px] font-light text-fg-muted">
            Everything in one grid, ready to save and post.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="tnum text-[13px] font-light text-fg-muted">
            {pieces.length} pieces
          </span>
          {sort === "random" && (
            <button
              type="button"
              onClick={onShuffle}
              className="focus-ring h-9 cursor-pointer rounded-full border border-line-slate px-4 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              Shuffle
            </button>
          )}
          <Dropdown
            id="sort"
            ariaLabel="Sort pieces"
            value={sort}
            onChange={onSort}
            options={[
              { value: "random", label: "Random" },
              { value: "latest", label: "Latest" },
              { value: "oldest", label: "Oldest" },
            ]}
          />
        </div>
      </div>

      <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by collection">
        <Chip active={filter === "all"} onClick={() => onFilter("all")}>
          All
        </Chip>
        {COLLECTIONS.map((c) => (
          <Chip key={c.id} active={filter === c.id} onClick={() => onFilter(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>

      {pieces.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-[16px] border border-dashed border-line-slate px-6 py-16 text-center">
          <p className="text-[15px] text-fg-body">
            This collection is empty for now.
          </p>
          <button
            type="button"
            onClick={() => onFilter("all")}
            className="focus-ring h-10 cursor-pointer rounded-full border-[1.5px] border-accent px-6 text-[13px] font-semibold text-accent transition-colors hover:bg-accent hover:text-on-light"
          >
            Show all
          </button>
        </div>
      ) : (
        <div className="mt-8 columns-2 gap-4 md:columns-3 xl:columns-4">
          {pieces.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p)}
              aria-label={`Open ${p.title}`}
              className="focus-ring group relative mb-4 block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-[10px] border border-line-slate bg-surface transition-colors hover:border-accent/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt={p.title}
                width={p.w}
                height={p.h}
                loading="lazy"
                className="block h-auto w-full"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8 text-left opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
              >
                <span className="block text-[12px] font-semibold text-fg">
                  {p.title}
                </span>
                <span className="micro-label mt-0.5 block text-[9px]">
                  {collectionName(p.collection)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`focus-ring h-9 shrink-0 cursor-pointer rounded-full border px-4 text-[12px] font-medium transition-colors ${
        active
          ? "border-accent/60 bg-surface-active text-accent"
          : "border-line-slate text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
