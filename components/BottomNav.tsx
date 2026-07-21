"use client";

/**
 * Mobile bottom navigation (user direction 2026-07-13, modeled on the
 * reference's mobile chrome): fixed icon+label bar below md — the header's
 * nav links hide at the same breakpoint, so this is THE nav on phones.
 * Active item is white, inactive muted; safe-area inset padded for notched
 * devices. Desktop (md+) never sees it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookIcon,
  CoinsIcon,
  LightningIcon,
  TilesIcon,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  activePrefix?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Mine", icon: TilesIcon },
  { href: "/stake", label: "Stake", icon: CoinsIcon },
  { href: "/docs/intro", label: "About", activePrefix: "/docs", icon: BookIcon },
  { href: "/explore", label: "Explore", icon: LightningIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-slate bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex h-16 items-stretch">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.activePrefix ?? item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
                active ? "text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              <Icon size={20} />
              <span
                className={`text-[11px] ${active ? "font-bold" : "font-medium"}`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
