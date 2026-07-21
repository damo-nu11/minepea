/**
 * The site's single content seam. Adding a piece = drop the file in
 * public/art/ and append one entry to PIECES; collection counts, the grid,
 * search, sort, and the lightbox all derive from this list. See the README.
 *
 * The current entries are PLACEHOLDERS (generated sample graphics) so the
 * whole experience is exercisable before real art lands. The two brand
 * assets (coin + wordmark) are real and downloadable today.
 */

export type CollectionId = "official" | "memes" | "gifs" | "threed";

export interface Collection {
  id: CollectionId;
  name: string;
  blurb: string;
  /** Piece used as the collection card's cover image. */
  cover: string;
}

export interface Piece {
  /** Stable unique slug; doubles as the React key and download name. */
  id: string;
  title: string;
  collection: CollectionId;
  tags: string[];
  src: string;
  /** Natural dimensions, used for layout stability in the masonry grid. */
  w: number;
  h: number;
  /** ISO date the piece was added; drives Latest/Oldest sorting. */
  added: string;
}

export const COLLECTIONS: Collection[] = [
  {
    id: "official",
    name: "Official Art",
    blurb: "Core PEA artwork and official visual drops.",
    cover: "/art/sample-wordmark-study.svg",
  },
  {
    id: "memes",
    name: "Memes",
    blurb: "Post-ready formats and running jokes.",
    cover: "/art/sample-up-only.svg",
  },
  {
    id: "gifs",
    name: "GIFs",
    blurb: "Loops and reactions for replies.",
    cover: "/art/sample-checker-fade.svg",
  },
  {
    id: "threed",
    name: "3D",
    blurb: "Renders and dimensional takes on the coin.",
    cover: "/art/sample-halftone.svg",
  },
];

export const PIECES: Piece[] = [
  {
    id: "pea-coin",
    title: "The PEA coin",
    collection: "official",
    tags: ["logo", "brand"],
    src: "/art/pea-coin.png",
    w: 500,
    h: 500,
    added: "2026-05-20",
  },
  {
    id: "pea-wordmark",
    title: "PEA wordmark",
    collection: "official",
    tags: ["logo", "wordmark"],
    src: "/art/pea-wordmark.svg",
    w: 2943,
    h: 1240,
    added: "2026-05-20",
  },
  {
    id: "grid-strike",
    title: "Grid strike",
    collection: "official",
    tags: ["grid", "tiles"],
    src: "/art/sample-grid-strike.svg",
    w: 800,
    h: 800,
    added: "2026-07-12",
  },
  {
    id: "pod-study",
    title: "Pod study",
    collection: "official",
    tags: ["pod", "study"],
    src: "/art/sample-pod-study.svg",
    w: 800,
    h: 1000,
    added: "2026-07-10",
  },
  {
    id: "wordmark-study",
    title: "Wordmark study",
    collection: "official",
    tags: ["wordmark", "type"],
    src: "/art/sample-wordmark-study.svg",
    w: 800,
    h: 500,
    added: "2026-06-28",
  },
  {
    id: "signal-rings",
    title: "Signal rings",
    collection: "official",
    tags: ["rings", "glow"],
    src: "/art/sample-signal-rings.svg",
    w: 800,
    h: 800,
    added: "2026-07-08",
  },
  {
    id: "volt",
    title: "Volt",
    collection: "memes",
    tags: ["bolt", "voltage"],
    src: "/art/sample-volt.svg",
    w: 800,
    h: 1000,
    added: "2026-07-06",
  },
  {
    id: "night-static",
    title: "Night static",
    collection: "threed",
    tags: ["dots", "night"],
    src: "/art/sample-night-static.svg",
    w: 800,
    h: 1067,
    added: "2026-07-02",
  },
  {
    id: "crosshair",
    title: "Crosshair",
    collection: "gifs",
    tags: ["target", "precision"],
    src: "/art/sample-crosshair.svg",
    w: 800,
    h: 800,
    added: "2026-06-08",
  },
  {
    id: "hazard-lines",
    title: "Hazard lines",
    collection: "memes",
    tags: ["stripes", "warning"],
    src: "/art/sample-hazard-lines.svg",
    w: 800,
    h: 500,
    added: "2026-07-04",
  },
  {
    id: "up-only",
    title: "Up only",
    collection: "memes",
    tags: ["chart", "green"],
    src: "/art/sample-up-only.svg",
    w: 800,
    h: 500,
    added: "2026-06-22",
  },
  {
    id: "starburst",
    title: "Starburst",
    collection: "memes",
    tags: ["burst", "rays"],
    src: "/art/sample-starburst.svg",
    w: 800,
    h: 800,
    added: "2026-06-05",
  },
  {
    id: "checker-fade",
    title: "Checker fade",
    collection: "gifs",
    tags: ["loop", "checker"],
    src: "/art/sample-checker-fade.svg",
    w: 800,
    h: 800,
    added: "2026-06-18",
  },
  {
    id: "ledger-lines",
    title: "Ledger lines",
    collection: "gifs",
    tags: ["barcode", "loop"],
    src: "/art/sample-ledger-lines.svg",
    w: 800,
    h: 1067,
    added: "2026-05-28",
  },
  {
    id: "crescent",
    title: "Crescent",
    collection: "gifs",
    tags: ["night", "motion"],
    src: "/art/sample-crescent.svg",
    w: 800,
    h: 1000,
    added: "2026-06-15",
  },
  {
    id: "voltage-waves",
    title: "Voltage waves",
    collection: "memes",
    tags: ["waves", "motion"],
    src: "/art/sample-voltage-waves.svg",
    w: 800,
    h: 500,
    added: "2026-06-12",
  },
  {
    id: "coin-study",
    title: "Coin study",
    collection: "threed",
    tags: ["coin", "render"],
    src: "/art/sample-coin-study.svg",
    w: 800,
    h: 800,
    added: "2026-06-25",
  },
  {
    id: "halftone",
    title: "Halftone",
    collection: "threed",
    tags: ["halftone", "depth"],
    src: "/art/sample-halftone.svg",
    w: 800,
    h: 1000,
    added: "2026-06-01",
  },
];

export const collectionName = (id: CollectionId): string =>
  COLLECTIONS.find((c) => c.id === id)?.name ?? id;

export const collectionCount = (id: CollectionId): number =>
  PIECES.filter((p) => p.collection === id).length;

/** Official links, in one place. */
export const LINKS = {
  site: "https://minepea.com",
  x: "https://x.com/minepea_",
  discord: "https://discord.gg/MKSmTFKZW",
  terms: "https://minepea.com/terms",
  privacy: "https://minepea.com/privacy",
  brandKitZip: "/brand/pea-brand-kit.zip",
} as const;
