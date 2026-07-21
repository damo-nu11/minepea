/**
 * H1 + muted subtitle block shared by every content page (ui-spec §1.2).
 * H1s are set in the brand face (Unbounded 700) and carry the wordmark's
 * split treatment (user direction 2026-07-13): the tail of the word and
 * an appended period render in the accent lime, e.g. Exp[lore.] like
 * PE[A.]. Curated split points per known title; unknown titles fall back
 * to a ~55% split.
 */

/** White-prefix length per title (the rest + "." goes accent). */
const SPLITS: Record<string, number> = {
  Explore: 3, // Exp|lore.
  Stake: 3, // Sta|ke.
  Introduction: 5, // Intro|duction.
  Mining: 3, // Min|ing.
  Staking: 4, // Stak|ing.
  Tokenomics: 5, // Token|omics.
  Links: 3, // Lin|ks.
  Terms: 3, // Ter|ms.
  Privacy: 4, // Priv|acy.
};
export function PageHeader({
  title,
  subtitle,
  aside,
}: {
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="font-wordmark text-[34px] font-bold leading-tight tracking-[-0.01em] text-fg">
          {title.slice(0, SPLITS[title] ?? Math.ceil(title.length * 0.55))}
          <span className="text-accent">
            {title.slice(SPLITS[title] ?? Math.ceil(title.length * 0.55))}.
          </span>
        </h1>
        <p className="mt-2 text-[17px] text-fg-muted">{subtitle}</p>
      </div>
      {aside}
    </div>
  );
}

/** Wide left-aligned container (Explore / Docs pages, ui-spec §1.3). */
export function WideContainer({ children }: { children: React.ReactNode }) {
  return <div className="w-full px-9 pt-14 md:px-[148px]">{children}</div>;
}

/** Centered ~640px control column (Stake / Trade pages, ui-spec §1.3). */
export function ControlColumn({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[640px] px-6 pt-14">{children}</div>;
}
