"use client";

import { DiscordIcon, XIcon } from "@/components/Icons";
import { Wordmark } from "@/components/Wordmark";
import { LINKS } from "@/lib/content";

/**
 * Sticky chrome, minimal by direction (user 2026-07-17): wordmark on the
 * left; Brand kit anchor + X and Discord on the right. No search bar and
 * no submit action; the site is official-drops only for now.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line-faint bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-[64px] max-w-[1400px] items-center justify-between px-4 md:h-[72px] md:px-8">
        <a href="#top" className="focus-ring flex shrink-0 items-center rounded">
          <Wordmark className="text-[22px] md:text-[26px]" />
        </a>

        <div className="flex items-center gap-1 md:gap-2">
          <a
            href="#brandkit"
            className="focus-ring mr-2 rounded text-[13px] font-medium text-fg-muted transition-colors hover:text-fg md:mr-4"
          >
            Brand kit
          </a>
          <a
            href={LINKS.discord}
            aria-label="Discord"
            className="focus-ring rounded-full p-2 text-fg-muted transition-colors hover:text-fg"
          >
            <DiscordIcon size={19} />
          </a>
          <a
            href={LINKS.x}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X"
            className="focus-ring rounded-full p-2 text-fg-muted transition-colors hover:text-fg"
          >
            <XIcon size={17} />
          </a>
        </div>
      </div>
    </header>
  );
}
