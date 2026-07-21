import { DiscordIcon, XIcon } from "@/components/Icons";
import { Wordmark } from "@/components/Wordmark";
import { LINKS } from "@/lib/content";

/**
 * Footer: wordmark, the route back to the main site, socials, and the legal
 * pages (which live on the main domain).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line-faint">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-6 px-4 py-10 md:flex-row md:px-8">
        <Wordmark className="text-[20px]" />

        <nav className="flex items-center gap-6" aria-label="Footer">
          <a
            href={LINKS.site}
            className="focus-ring rounded text-[12.5px] text-fg-muted transition-colors hover:text-fg"
          >
            Mine
          </a>
          <a
            href={LINKS.terms}
            className="focus-ring rounded text-[12.5px] text-fg-muted transition-colors hover:text-fg"
          >
            Terms
          </a>
          <a
            href={LINKS.privacy}
            className="focus-ring rounded text-[12.5px] text-fg-muted transition-colors hover:text-fg"
          >
            Privacy
          </a>
          <a
            href={LINKS.discord}
            aria-label="Discord"
            className="focus-ring rounded p-1 text-fg-muted transition-colors hover:text-fg"
          >
            <DiscordIcon size={17} />
          </a>
          <a
            href={LINKS.x}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X"
            className="focus-ring rounded p-1 text-fg-muted transition-colors hover:text-fg"
          >
            <XIcon size={16} />
          </a>
        </nav>

        <p className="text-[11px] font-light text-fg-muted">
          Made for the PEA community.
        </p>
      </div>
    </footer>
  );
}
