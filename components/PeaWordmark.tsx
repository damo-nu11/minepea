/**
 * PEA wordmark — brand decision 2026-07-13: Unbounded (900), white "PE" +
 * accent-lime "A." with tight tracking, matching the reference logotype.
 * Flat text, no 3D. Size it with a text-size class on `className`.
 * (History: the original geometric SVG logotype was replaced by this.)
 */
export function PeaWordmark({ className }: { className?: string }) {
  return (
    <span
      className={`font-wordmark font-black leading-none tracking-[-0.01em] text-fg ${className ?? ""}`}
    >
      PE
      <span className="text-accent">A.</span>
    </span>
  );
}
