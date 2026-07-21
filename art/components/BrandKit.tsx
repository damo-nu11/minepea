"use client";

import { DownloadIcon } from "@/components/Icons";
import { Wordmark } from "@/components/Wordmark";
import { LINKS } from "@/lib/content";

/**
 * Brand kit: the real, downloadable zip (coin + wordmark today; grows with
 * the kit) plus the three usage rules. No guidelines PDF by design (user
 * 2026-07-17): the kit and the rules ARE the guidance.
 */
const RULES = [
  "Keep the coin unedited when you use it as a logo.",
  "Remix everything else as hard as you like.",
  "Do not present your piece as an official drop.",
];

export function BrandKit() {
  return (
    <section id="brandkit" className="mx-auto max-w-[1100px] scroll-mt-20 px-4 py-16 md:px-8 md:py-20">
      <div className="glass-pane grid gap-10 rounded-[16px] p-8 md:grid-cols-2 md:items-center md:p-12">
        <div>
          <span className="micro-label">Brand kit</span>
          <h2 className="mt-3 text-[28px] font-bold tracking-[-0.01em] text-fg md:text-[34px]">
            Make it yours<span className="text-accent">.</span>
          </h2>
          <p className="mt-4 max-w-[440px] text-[14px] leading-relaxed text-fg-body">
            Logos and marks for posts, edits, and community artwork. Take the
            kit and build.
          </p>

          <ul className="mt-6 flex flex-col gap-3">
            {RULES.map((rule) => (
              <li key={rule} className="flex items-start gap-3 text-[13px] leading-relaxed text-fg-body">
                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                {rule}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <a
              href={LINKS.brandKitZip}
              download
              className="focus-ring inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-6 text-[14px] font-bold text-on-light shadow-[0_0_24px_-8px_var(--color-accent)] transition hover:brightness-110"
            >
              <DownloadIcon size={16} />
              Download kit
            </a>
          </div>
        </div>

        <div className="flex flex-col items-center gap-7 rounded-[12px] border border-line-slate bg-bg px-8 py-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/art/pea-coin.png"
            alt="The PEA coin logo"
            width={500}
            height={500}
            loading="lazy"
            className="h-auto w-24"
          />
          <Wordmark className="text-[40px]" />
          <p className="micro-label text-center">Coin + wordmark, in the kit</p>
        </div>
      </div>
    </section>
  );
}
