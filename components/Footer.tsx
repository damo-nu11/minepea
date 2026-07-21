/**
 * Site footer (user 2026-07-15): About / Privacy / Terms, on every page.
 *
 * Owns the mobile bottom padding that used to sit on <main> — it's the last
 * thing in the column, so the clearance for the fixed BottomNav belongs here;
 * left on <main> the links would render underneath the nav.
 */

import Link from "next/link";

const LINKS: { label: string; href: string }[] = [
  { label: "About", href: "/docs/intro" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export function Footer() {
  return (
    <footer className="flex items-center justify-center gap-7 px-4 pt-8 pb-[calc(24px+64px+env(safe-area-inset-bottom))] md:pb-8">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-[12.5px] text-fg-muted transition-colors hover:text-fg"
        >
          {link.label}
        </Link>
      ))}
    </footer>
  );
}
