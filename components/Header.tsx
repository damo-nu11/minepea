"use client";

/**
 * Shared header: wordmark → flat nav (Mine / Stake / About / Explore — no
 * dropdown, per product decision 2026-07-12) → PEA + ETH tickers (live from
 * usePrices) → socials → Connect pill. Active nav item = white text + white
 * underline at the header's bottom edge.
 *
 * Responsive (CSS only): below md the nav links hide (BottomNav takes over,
 * per the mobile chrome direction 2026-07-13) and the left side shows the
 * wordmark only; tickers ≥lg; socials <md and ≥xl (the md–xl band hides
 * them for space — deliberate).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";
import {
  DiscordIcon,
  EthIcon,
  GitHubIcon,
  PeaIcon,
  XIcon,
} from "@/components/icons";
import { PeaWordmark } from "@/components/PeaWordmark";
import { usePrices } from "@/lib/hooks/useGame";

interface NavLink {
  label: string;
  href: string;
  /** Prefix that marks the link active (null ⇒ exact match on href). */
  activePrefix: string | null;
}

const NAV_LINKS: NavLink[] = [
  { label: "Mine", href: "/", activePrefix: null },
  { label: "Stake", href: "/stake", activePrefix: "/stake" },
  { label: "About", href: "/docs/intro", activePrefix: "/docs" },
  { label: "Explore", href: "/explore", activePrefix: "/explore" },
];

/** Lime 2.5px underline sitting just beneath the active label (small gap). */
function ActiveUnderline() {
  return (
    <span
      aria-hidden
      className="absolute -inset-x-2 top-full mt-[3px] h-[2.5px] rounded-full bg-accent"
    />
  );
}

/** PEA has no market yet — placeholder pair the user supplied (2026-07-13);
 * swap for the real PEA pair at launch. */
const PEA_CHART_URL =
  "https://dexscreener.com/robinhood/0xa70fc67c9f69da90b63a0e4c05d229954574e313";
/** The Robinhood chain quotes everything IN WETH (no ETH/stable pair exists
 * there), so ETH links to Dexscreener's deepest mainnet WETH/USDC pool —
 * the canonical ETH price chart on the same aggregator (API-verified). */
const ETH_CHART_URL =
  "https://dexscreener.com/ethereum/0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

function Ticker({
  icon,
  symbol,
  price,
  href,
}: {
  icon: React.ReactNode;
  symbol: string;
  price: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${symbol} price chart on Dexscreener`}
      className="tnum group flex items-center gap-2 text-[12.5px]"
    >
      {icon}
      <span className="font-medium text-fg">{symbol}</span>
      <span className="text-fg-muted transition-colors group-hover:text-fg">
        {price}
      </span>
    </a>
  );
}

export function Header() {
  const pathname = usePathname();
  const prices = usePrices();

  return (
    <header className="flex h-[68px] shrink-0 items-stretch justify-between bg-bg px-3 md:h-[80px] md:px-8">
      {/* Left: wordmark + nav */}
      <div className="flex min-w-0 items-stretch gap-3 md:gap-8 xl:gap-[72px]">
        <Link
          href="/"
          className="flex items-center text-fg"
          aria-label="PEA home"
        >
          <PeaWordmark className="text-[25px] md:text-[32px]" />
        </Link>
        <nav className="hidden items-stretch gap-3 md:flex md:gap-5 xl:gap-10">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.activePrefix ?? link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center text-[13px] transition-colors md:text-[15px] ${
                  active
                    ? "font-bold text-fg"
                    : "font-medium text-fg-muted hover:text-fg"
                }`}
              >
                <span className="relative">
                  {link.label}
                  {active && <ActiveUnderline />}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right: tickers (≥lg), socials (≥xl), connect. CSS breakpoints only
          (Convention: no JS isMobile trees). */}
      <div className="flex items-center gap-2 md:gap-4 xl:gap-8">
        <span className="hidden items-center gap-6 lg:flex xl:gap-8">
          {/* A 0 price means "no market/feed yet" (real backend pre-launch),
              not a real quote — render the em-dash, never "$0.00". */}
          <Ticker
            icon={<PeaIcon size={14} className="text-fg" />}
            symbol="PEA"
            price={
              prices.data && prices.data.peaUsd > 0
                ? prices.data.peaUsdFormatted
                : "—"
            }
            href={PEA_CHART_URL}
          />
          <Ticker
            icon={<EthIcon size={14} className="text-fg" />}
            symbol="ETH"
            price={
              prices.data && prices.data.ethUsd > 0
                ? prices.data.ethUsdFormatted
                : "—"
            }
            href={ETH_CHART_URL}
          />
        </span>
        <span className="flex items-center gap-1 text-fg-muted md:hidden xl:flex xl:gap-3">
          <a
            href="https://discord.gg/MKSmTFKZW"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
            className="p-1.5 transition-colors hover:text-fg"
          >
            <DiscordIcon size={19} />
          </a>
          <a
            href="#"
            aria-label="GitHub"
            className="p-1.5 transition-colors hover:text-fg"
          >
            <GitHubIcon size={19} />
          </a>
          <a
            href="https://x.com/minepea_"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X"
            className="p-1.5 transition-colors hover:text-fg"
          >
            <XIcon size={17} />
          </a>
        </span>
        <ConnectButton />
      </div>
    </header>
  );
}
