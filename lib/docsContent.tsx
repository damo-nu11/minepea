/**
 * Docs content (Phase 7) — ALL COPY IS ORIGINAL WRITING for PEA (Hard Rule 3).
 * Structure: ordered sections rendered at /docs/[slug] with a right TOC and
 * a Next/Prev pager. Body copy is data here, not inline in components.
 */

import type { ReactNode } from "react";

export interface DocsSection {
  slug: string;
  title: string;
  subtitle: string;
  body: ReactNode;
}

const P = ({ children }: { children: ReactNode }) => (
  <p className="text-[19px] leading-[1.65] text-fg-body">{children}</p>
);

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="font-wordmark mt-14 text-[23px] font-bold tracking-[-0.01em] text-fg">
    {children}
  </h2>
);

const B = ({ children }: { children: ReactNode }) => (
  <strong className="font-bold">{children}</strong>
);

export const DOCS_SECTIONS: DocsSection[] = [
  {
    slug: "intro",
    title: "Intro",
    subtitle: "Get to know the protocol.",
    body: (
      <div className="flex flex-col gap-6">
        <P>
          PEA is a scarce digital commodity that anyone can mine and stake, live
          on an <B>Ethereum</B> rollup.
        </P>
        <H2>Motivation</H2>
        <P>
          PEA is mined, not sold. Rounds are open to anyone with any amount of
          ETH, the odds and the payouts are the same for everyone, and the
          protocol never sells you a token: it only pays out what miners win.
          Emission is continuous, on-chain and verifiable. Alongside mined
          supply, a portion of PEA is allocated to the team and the treasury,
          and protocol revenue flows back to the people who mine and stake.
        </P>
      </div>
    ),
  },
  {
    slug: "mining",
    title: "Mining",
    subtitle: "How rounds and rewards work.",
    body: (
      <div className="flex flex-col gap-6">
        <P>
          Mining runs in <B>60-second rounds</B> on a board of 25 tiles. During
          a round, miners deploy ETH onto any set of tiles: a single tile, a
          handful, or the whole board.
        </P>
        <H2>Settlement</H2>
        <P>
          When the clock hits zero, one tile is drawn, weighted by the ETH
          sitting on it. Every miner who covered the winning tile shares the
          round&apos;s ETH pot in proportion to their deploys. A 10% protocol
          fee is taken on each round&apos;s deploys before winnings are paid,
          and that fee is what funds buybacks and staking yield. Each round also
          mints 1.1 PEA: one PEA goes to the winning tile, with a 50/50 chance
          of being split across everyone on it or awarded to a single miner
          pro-rata.
        </P>
        <H2>The Peapot</H2>
        <P>
          The other 0.1 PEA minted each round grows the peapot, a jackpot that
          builds behind every round. Each settlement has a 1-in-633 chance of
          cracking it open; when it drops, the winning miner takes the whole pot
          and it starts rebuilding from scratch.
        </P>
        <H2>Strategy</H2>
        <P>
          Covering more tiles raises your odds of hitting the winner but spreads
          your ETH thinner. Pick exact tiles, tune the amount per tile, and
          repeat a position across consecutive rounds, or hit ALL to cover the
          full board in one tap.
        </P>
      </div>
    ),
  },
  {
    slug: "staking",
    title: "Staking",
    subtitle: "How yield is generated.",
    body: (
      <div className="flex flex-col gap-6">
        <P>
          Staking lets PEA holders earn a share of everything the protocol takes
          in. Deposit PEA into the <B>staking pool</B> and your position starts
          accruing immediately; withdraw whenever you like.
        </P>
        <H2>Where the yield comes from</H2>
        <P>
          The 10% protocol fee on every round buys back PEA on the open market.
          95% of that PEA is burned and the remaining 5% is streamed to the
          staking pool, so the APR you see is backed by real activity, not
          emissions. When mining is busy, yield rises; when it cools, yield
          follows. The APR shown on the Stake page is estimated from a 7-day
          rolling average.
        </P>
      </div>
    ),
  },
  {
    slug: "tokenomics",
    title: "Tokenomics",
    subtitle: "Supply, emissions, and burns.",
    body: (
      <div className="flex flex-col gap-6">
        <P>
          PEA has a hard cap of <B>3,000,000</B> tokens and launched with an
          initial supply of <B>10,000</B>. Beyond that, PEA enters circulation
          through mining rounds and peapot drops, alongside allocations held by
          the team and the treasury.
        </P>
        <H2>Emissions</H2>
        <P>
          New PEA is minted only at settlement, at a fixed rate of 1.1 PEA per
          round: one to the winning tile and 0.1 to the peapot. Because rounds
          run around the clock, emission is smooth and predictable rather than
          cliff-based.
        </P>
        <H2>Burning</H2>
        <P>
          The 10% protocol fee buys back PEA on the open market, and 95% of the
          bought-back PEA is <B>burned</B>, removing it from circulation
          permanently (the other 5% goes to stakers). The Explore page tracks
          cumulative burn and weekly mint versus burn.
        </P>
      </div>
    ),
  },
  {
    slug: "links",
    title: "Links",
    subtitle: "Official channels and resources.",
    body: (
      <div className="flex flex-col gap-6">
        <P>Everything official lives in one of these places:</P>
        <ul className="flex flex-col gap-3 text-[19px] leading-[1.65] text-fg-body">
          <li>
            <B>App</B>: mine and stake PEA on this site.
          </li>
          <li>
            <B>Discord</B>:{" "}
            <a
              href="https://discord.gg/MKSmTFKZW"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded-sm text-accent underline-offset-2 hover:underline"
            >
              community chat and support
            </a>
            .
          </li>
          <li>
            <B>GitHub</B>: open-source code and audits. (Link coming soon.)
          </li>
          <li>
            <B>X</B>:{" "}
            <a
              href="https://x.com/minepea_"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded-sm text-accent underline-offset-2 hover:underline"
            >
              announcements and round highlights
            </a>
            .
          </li>
        </ul>
        <P>
          Anything not listed here is not us. Always double-check URLs before
          connecting a wallet.
        </P>
      </div>
    ),
  },
];

export const DOCS_SLUGS = DOCS_SECTIONS.map((s) => s.slug);

export function getDocsSection(slug: string): DocsSection | undefined {
  return DOCS_SECTIONS.find((s) => s.slug === slug);
}
