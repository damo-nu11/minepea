/**
 * PEA wordmark — verbatim copy of the main site's PeaWordmark (brand decision
 * 2026-07-13): Unbounded 900, white "PE" + accent-lime "A.", tight tracking.
 * If the main site's wordmark changes, mirror it here.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`font-wordmark font-black leading-none tracking-[-0.01em] text-fg ${className ?? ""}`}
    >
      PE
      <span className="text-accent">A.</span>
    </span>
  );
}
