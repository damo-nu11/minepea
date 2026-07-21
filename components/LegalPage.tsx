/**
 * Renderer for the legal documents (/terms, /privacy) held in
 * lib/legalContent.ts.
 *
 * Prose matches the docs pages (19px body, brand-face headings) — the site's
 * long-form precedent — rather than inventing a legal-only type scale.
 * Sections are numbered so clauses can be cited ("section 11"), which the
 * documents' own cross-references rely on.
 */

import { PageHeader } from "@/components/PageHeader";
import type { LegalBlock, LegalDoc } from "@/lib/legalContent";

/** Index keys are safe here: the content is static and never reorders. */
function Blocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <div key={i} className="flex flex-col gap-4">
          <p className="text-[19px] leading-[1.65] text-fg-body">
            {block.label && (
              <strong className="font-bold text-fg">{block.label}. </strong>
            )}
            {block.text}
          </p>
          {block.items && (
            <ul className="flex list-disc flex-col gap-3 pl-6 marker:text-accent">
              {block.items.map((item) => (
                <li key={item} className="text-[19px] leading-[1.65] text-fg-body">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-6 pt-14 pb-16">
      <PageHeader
        title={doc.title}
        subtitle={`${doc.formalTitle}. Last updated ${doc.updated}.`}
      />

      <div className="mt-10 flex flex-col gap-6">
        <Blocks blocks={doc.intro} />
      </div>

      {doc.sections.map((section, i) => (
        <section key={section.heading} className="mt-14 flex flex-col gap-6">
          <h2 className="font-wordmark text-[23px] font-bold tracking-[-0.01em] text-fg">
            {i + 1}. {section.heading}
          </h2>
          <Blocks blocks={section.blocks} />

          {section.subsections?.map((sub, j) => (
            <section key={sub.heading} className="mt-2 flex flex-col gap-6">
              <h3 className="font-wordmark text-[17px] font-bold text-fg">
                {i + 1}.{j + 1} {sub.heading}
              </h3>
              <Blocks blocks={sub.blocks} />
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}
