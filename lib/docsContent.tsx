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
    subtitle: "What PEA is and how it works.",
    body: (
      <div className="flex flex-col gap-6">
        <P>
          PEA is a mining protocol on <B>Robinhood Chain</B>. Miners deploy ETH
          onto a pentagon board of 25 tiles, one tile is drawn at the end of
          every round, and the miners who covered it share the round&apos;s ETH,
          less the protocol fee, along with most of the PEA the round mints.
        </P>

        <H2>How a round works</H2>
        <P>
          Rounds last 60 seconds. You deploy ETH onto any set of tiles, from one
          to all 25. At settlement one tile is drawn at random by Pyth
          Network&apos;s VRF, so every tile has the same 1-in-25 chance however
          much ETH sits on it.
        </P>

        <H2>What you pay</H2>
        <ul className="flex flex-col gap-3 text-[19px] leading-[1.65] text-fg-body">
          <li>
            <B>Protocol fee.</B> 10% of the ETH deployed in each round, taken
            before winnings are paid.
          </li>
          <li>
            <B>Harvest fee.</B> A flat 10% of the PEA you harvest, paid out to
            miners still holding unharvested PEA.
          </li>
          <li>
            <B>AutoMiner fee.</B> 1%, if you let the AutoMiner mine for you.
          </li>
          <li>
            <B>Gas.</B> The network fee on any transaction you send, paid to the
            network rather than to us.
          </li>
        </ul>

        <H2>Custody</H2>
        <P>
          Nothing moves without a transaction you signed. The one exception is
          the AutoMiner, where you sign a deposit and a fixed configuration once
          and an executor deploys it for you within those limits. Wallet
          connection runs through Privy, this site holds no keys and cannot move
          your funds, and the contracts run whether or not this interface is up.
        </P>
      </div>
    ),
  },
  {
    slug: "mining",
    title: "Mining",
    subtitle: "How rounds, deploys and rewards work.",
    body: (
      <div className="flex flex-col gap-6">
        <P>
          Mining runs in <B>60-second rounds</B> on a pentagon board of 25
          tiles, followed by a short settling phase. During a round, miners
          deploy ETH onto any set of tiles: a single tile, a handful, or the
          whole board.
        </P>

        <H2>Deploying</H2>
        <P>
          The amount you enter is <B>per tile</B>, not per deploy, so covering
          all 25 at 0.01 ETH costs 0.25 ETH. The contract sets a minimum per
          tile.
        </P>
        <P>
          You get <B>one deploy per address per round</B>: once it lands, your
          tiles are fixed until the next round. The interface stops accepting
          deploys in the closing seconds, because a signature you start too late
          can land in the following round instead of the one you meant. If that
          happens the interface tells you so.
        </P>

        <H2>Settlement</H2>
        <P>
          When the clock hits zero, one tile is drawn at random by Pyth
          Network&apos;s VRF. Every tile has the same 1-in-25 chance, however
          much ETH sits on it, and a tile nobody covered can win. A flat{" "}
          <B>10% protocol fee</B> is taken from the ETH deployed that round, and
          that fee is what funds buybacks and staking yield. Miners on the
          winning tile share what remains, pro-rata to what they deployed{" "}
          <B>on that tile</B>, so if you covered all 25 you are paid on the
          portion that sat on the drawn tile.
        </P>
        <P>
          If the drawn tile turns out to be one nobody covered, the round has no
          winners and all of its ETH goes to the vault, where it buys back PEA
          in the same way the protocol fee does. That is unlikely while the
          board is well covered, and more likely when it is not.
        </P>
        <P>
          Each round also mints <B>1.1 PEA</B>. 1.0 goes to the winning tile:
          where more than one miner covered it, a 50/50 draw settled by the same
          VRF decides whether that PEA splits across them pro-rata to their ETH
          on the tile or goes whole to one of them. If only one miner covered
          the tile, there is no draw and they take the full 1.0 PEA.
        </P>

        <H2>The peapot</H2>
        <P>
          The other 0.1 PEA minted each round grows the peapot, a jackpot that
          builds behind every round. It has a 1-in-333 chance of hitting each
          round. When it does, it pays out to the miners on the winning tile and
          starts building again from zero.
        </P>

        <H2>Harvesting</H2>
        <P>
          Winnings are credited to your address inside the contracts, not to
          your wallet, and cannot be moved until you harvest them. Harvesting
          PEA costs a flat 10% fee, and that fee is paid out to everyone who
          still holds unharvested PEA, so an unharvested balance earns a share
          of what other miners pay to harvest theirs. The 10% applies only to
          your unharvested balance: PEA you have already received from other
          miners&apos; harvest fees is never charged again.
        </P>
        <P>
          PEA and ETH are claimed separately, and a fresh win is checkpointed
          onchain before it can be claimed, which the interface handles as an
          extra transaction.
        </P>

        <H2>Mining across several rounds</H2>
        <P>
          The AutoMiner deploys for you. You prepay a deposit and fix the
          configuration, the same tiles and the same amount per tile, for a set
          number of rounds. It charges a 1% fee on each round it deploys for
          you, taken out of your deposit. Arming it stakes nothing in the round
          on screen: its first deploy lands in a later one. One runs at a time,
          and stopping it returns the unspent balance.
        </P>

        <H2>Strategy</H2>
        <P>
          Because the draw is flat, covering a given number of tiles gives you
          that many chances in 25, whatever anyone else deploys. What changes
          with the crowd is the payout, not the odds: you are paid your share of
          the drawn tile, so the same ETH returns more on a tile few others
          covered and less on a busy one. Covering more tiles raises the chance
          you hold the winner but spreads your ETH thinner. Pick exact tiles,
          tune the amount per tile, and repeat a position across consecutive
          rounds, or hit ALL to cover the full board in one tap.
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
          Staking lets PEA holders earn a share of the protocol fee. Deposit PEA
          into the <B>staking pool</B> and your position starts earning from the
          next buyback; withdraw whenever you like.
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
        <H2>Depositing and withdrawing</H2>
        <P>
          There is no lock-up and no unbonding period. The contract sets a
          minimum deposit. A deposit takes two transactions when you have not
          already approved enough PEA: an approval, then the deposit. If an
          earlier approval still covers the amount, it is one. Yield is not
          compounded for you and the quoted APR assumes no compounding, though
          you can compound what you have accrued in one transaction.
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
          through mining rounds, alongside allocations held by the team and the
          treasury.
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
          bought back PEA is <B>burned</B>, removing it from circulation
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
            <B>GitHub</B>:{" "}
            <a
              href="https://github.com/damo-nu11/minepea"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded-sm text-accent underline-offset-2 hover:underline"
            >
              the source code for this site
            </a>
            .
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
        <H2>Contracts</H2>
        <P>
          The protocol&apos;s contract addresses, published here so you can
          verify anything you interact with:
        </P>
        <ul className="flex flex-col gap-3 text-[19px] leading-[1.65] text-fg-body">
          {[
            "Token Contract",
            "GridMining Contract",
            "Staking Contract",
            "AutoMiner Contract",
            "Vault Contract",
          ].map((label) => (
            <li key={label}>
              <B>{label}</B>: <span className="text-fg-muted">coming soon</span>
              .
            </li>
          ))}
        </ul>
        <P>
          Anything not listed here is not us. Always double-check URLs and
          contract addresses before connecting a wallet or signing anything.
        </P>
      </div>
    ),
  },
];

export const DOCS_SLUGS = DOCS_SECTIONS.map((s) => s.slug);

export function getDocsSection(slug: string): DocsSection | undefined {
  return DOCS_SECTIONS.find((s) => s.slug === slug);
}
