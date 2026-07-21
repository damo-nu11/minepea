/**
 * Docs layout (ui-spec §6): content column + fixed-feel right mini-TOC with
 * a vertical rule whose segment beside the active item is white, plus a
 * stacked Next/Prev pager bottom-right. Active state is route-derived
 * (recorded deviation: no scroll-spy — sections are separate routes).
 */

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DOCS_SECTIONS, type DocsSection } from "@/lib/docsContent";

function Toc({ activeSlug }: { activeSlug: string }) {
  return (
    <nav
      aria-label="Docs sections"
      className="sticky top-24 hidden shrink-0 lg:block"
    >
      <ul>
        {DOCS_SECTIONS.map((s) => {
          const active = s.slug === activeSlug;
          return (
            <li key={s.slug} className="flex h-12 items-stretch">
              <span
                aria-hidden
                className={`w-[2px] ${active ? "bg-fg" : "bg-line-slate"}`}
              />
              <Link
                href={`/docs/${s.slug}`}
                className={`font-wordmark flex items-center pl-6 text-[15px] tracking-[-0.01em] transition-colors ${
                  active
                    ? "font-bold text-fg"
                    : "font-medium text-fg-muted hover:text-fg"
                }`}
              >
                {s.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Pager({ section }: { section: DocsSection }) {
  const idx = DOCS_SECTIONS.findIndex((s) => s.slug === section.slug);
  const prev = idx > 0 ? DOCS_SECTIONS[idx - 1] : null;
  const next = idx < DOCS_SECTIONS.length - 1 ? DOCS_SECTIONS[idx + 1] : null;

  return (
    <div className="mt-24 flex items-start justify-between pb-20">
      {prev ? (
        <Link href={`/docs/${prev.slug}`} className="group flex flex-col gap-1">
          <span className="text-[14px] text-fg-muted">Previous</span>
          <span className="font-wordmark text-[16px] font-bold tracking-[-0.01em] text-fg group-hover:opacity-80">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`/docs/${next.slug}`}
          className="group flex flex-col items-end gap-1"
        >
          <span className="text-[14px] text-fg-muted">Next</span>
          <span className="font-wordmark text-[16px] font-bold tracking-[-0.01em] text-fg group-hover:opacity-80">
            {next.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

export function DocsLayout({ section }: { section: DocsSection }) {
  return (
    <div className="flex w-full gap-16 px-9 pt-14 md:px-[148px]">
      <article className="min-w-0 max-w-[1010px] flex-1">
        <PageHeader title={section.title} subtitle={section.subtitle} />
        <div className="mt-10">{section.body}</div>
        <Pager section={section} />
      </article>
      <Toc activeSlug={section.slug} />
    </div>
  );
}
