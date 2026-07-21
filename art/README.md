# PEA Art — art.minepea.com

The community media site: art, memes, GIFs, and brand assets, free to take
and post. A standalone Next.js app that deploys to its own subdomain,
separate from the main PEA app at the repo root.

## Run it

```
npm install --prefix art
npm run dev --prefix art     # http://localhost:3100
```

Or from the in-app browser: the `pea-art` launch config.

## Add a piece (the whole workflow)

1. Drop the file in `public/art/` (SVG, PNG, JPG, GIF, or WebP).
2. Append one entry to `PIECES` in `lib/content.ts`:
   - `id`: unique slug, doubles as the download filename
   - `title`, `collection`, `tags`: what search matches against
   - `src`: `/art/<filename>`
   - `w`, `h`: the file's natural pixel size (keeps the masonry stable)
   - `added`: ISO date, drives Latest/Oldest sorting

Collection counts, the grid, search, sort, and the lightbox all derive from
that one list. The current `sample-*` entries are generated placeholders;
delete them (file + entry) as real art lands. The coin and wordmark entries
are real brand assets and should stay.

## Update the brand kit

Replace or add files in `public/brand/`, then rebuild the zip:

```
cd public/brand && zip -r pea-brand-kit.zip . -x pea-brand-kit.zip
```

There is deliberately no guidelines PDF (user decision 2026-07-17): the kit
plus the three usage rules on the page are the guidance.

## Deploy (Vercel, second project on the same repo)

1. New Vercel project → same GitHub repo → **Root Directory: `art`**.
2. Attach `art.minepea.com` in the project's Domains.
3. No env vars needed; the site is fully static content + client state.

## Conventions carried over from the main app

- Voltage tokens only (`app/globals.css` mirrors the main token table; never
  hardcode a palette hex in a component).
- Unbounded is the only face; hierarchy comes from weight.
- No em or en dashes in user-facing copy.
- Images use plain `<img>` for now (local SVG-heavy manifest); revisit
  `next/image` when real raster art lands.
- The masonry is CSS multicol, which reads column-major: under the Latest
  sort the 2nd-newest piece sits below the newest, not beside it. Fine at
  foundation scale with Random as the default; if Latest becomes a primary
  browsing mode as the collection grows, switch to row-major masonry (JS
  round-robin into flex columns).
- The wordmark SVG (`public/art` + `public/brand` + the main app's copy) is
  OUTLINED Unbounded Black paths, not live text. Regenerate with outlines if
  the wordmark ever changes; a live-text SVG falls back to Arial Black in
  every `<img>` context and for anyone without the font installed.
