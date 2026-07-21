/**
 * Single icon module (Convention 5) — every glyph in the app lives here.
 * All icons inherit color via `currentColor` so token utilities drive them —
 * except PeaIcon, which renders the full-color brand coin image.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

/** PEA token glyph — the real brand coin (public/pea-logo.png, user asset
 * 2026-07-13; replaced the placeholder ring mark). One implementation, so
 * every call site renders the same logo. Color classes passed by callers
 * are harmless (the image is full-color). */
export function PeaIcon({ size = 18, className }: IconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size chrome icon; next/image adds nothing at 13-22px
    <img
      src="/pea-logo.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={`inline-block select-none ${className ?? ""}`}
    />
  );
}

/** Ethereum diamond — the OFFICIAL six-facet mark (ethereum.org brand
 * asset geometry), currentColor with per-facet opacities so it still
 * follows every color context (white in chrome, ghosted in unselected
 * tiles). Replaced the hand-drawn two-facet version (user: too cheap
 * next to the brand coin, 2026-07-13). */
export function EthIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 784.37 1277.39"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path opacity="0.6" d="m392.07 0-8.57 29.11v844.63l8.57 8.55 392.06-231.75Z" />
      <path d="M392.07 0 0 650.54l392.07 231.75V472.33Z" />
      <path opacity="0.62" d="m392.07 956.52-4.83 5.89v300.87l4.83 14.1 392.3-552.49Z" />
      <path d="M392.07 1277.38V956.52L0 724.89Z" />
      <path opacity="0.38" d="m392.07 882.29 392.06-231.75-392.06-178.21Z" />
      <path opacity="0.58" d="m0 650.54 392.07 231.75V472.33Z" />
    </svg>
  );
}

export function DiscordIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.37-.44.86-.6 1.25a18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.61-1.25.08.08 0 0 0-.08-.04c-1.71.3-3.35.81-4.88 1.52a.07.07 0 0 0-.04.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.1 13 13 0 0 1-1.87-.9.08.08 0 0 1 0-.12c.12-.1.25-.2.37-.3a.07.07 0 0 1 .08 0 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0c.12.1.25.2.37.3a.08.08 0 0 1 0 .13 12.3 12.3 0 0 1-1.87.89.08.08 0 0 0-.04.1c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .09.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .04-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.22 0 2.18 1.1 2.16 2.42 0 1.34-.94 2.42-2.16 2.42Z" />
    </svg>
  );
}

export function GitHubIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 .3a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58l-.01-2.03c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.65 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}

export function XIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}

/** 2×2 tiles glyph (tile-count chips, LAST ROUND bar). */
export function TilesIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

/** Pencil (inline edit affordance — ProfilePanel). */
export function PencilIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M16.5 3.7a2.3 2.3 0 0 1 3.8 3.8L7.5 20.3 3 21l.7-4.5L16.5 3.7Z" />
      <path d="M14.5 5.7l3.8 3.8" />
    </svg>
  );
}

/** Two offset sheets (copy-to-clipboard — ProfilePanel). */
export function CopyIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5" />
    </svg>
  );
}

/** Check mark (copy success state). */
export function CheckIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m4 12.5 5.5 5.5L20 6.5" />
    </svg>
  );
}

/** Camera (avatar upload badge — ProfilePanel). */
export function CameraIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2.2A1.5 1.5 0 0 1 10 3h4a1.5 1.5 0 0 1 1.3.8L16.7 6h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/** Stacked coins (Stake — mobile bottom nav). */
export function WalletIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4Z" />
    </svg>
  );
}

export function CoinsIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      <path d="M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

/** Open book (About — mobile bottom nav). */
export function BookIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 6.2C10.6 4.8 8.6 4 6.2 4H3v14.5h3.6c2.2 0 4 .7 5.4 2 1.4-1.3 3.2-2 5.4-2H21V4h-3.2c-2.4 0-4.4.8-5.8 2.2Z" />
      <path d="M12 6.2v14.3" strokeLinecap="round" />
    </svg>
  );
}

/** Lightning bolt (Rounds tab). */
export function LightningIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M13 2 3.5 13.5H10L9 22l9.5-11.5H12L13 2Z" />
    </svg>
  );
}

/** Four-point sparkle (Peapots tab). */
export function SparkleIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 2c.8 4.9 2.7 7.4 7.7 8.5.4.1.4.9 0 1-5 1.1-6.9 3.6-7.7 8.5-.1.4-.9.4-1 0-.8-4.9-2.7-7.4-7.7-8.5-.4-.1-.4-.9 0-1 5-1.1 6.9-3.6 7.7-8.5.1-.4.9-.4 1 0Z" />
    </svg>
  );
}

function Chevron({
  size = 16,
  className,
  rotate = 0,
}: IconProps & { rotate?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return <Chevron {...props} />;
}
export function ChevronLeftIcon(props: IconProps) {
  return <Chevron {...props} rotate={180} />;
}
export function ChevronDownIcon(props: IconProps) {
  return <Chevron {...props} rotate={90} />;
}

/** Speech bubble (support FAB). */
export function SpeechBubbleIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
    </svg>
  );
}

/** Person-in-circle avatar (MINERS feed rows). */
export function PersonIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
    </svg>
  );
}
