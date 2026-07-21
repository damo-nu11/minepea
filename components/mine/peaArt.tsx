/**
 * Shared pea material — the single source for every board's pea. The
 * live consumer is VineBoard; PlinkoBoard and WheelBoard still import
 * it but are retired and mounted by nothing.
 * pea updates together (shared-primitives convention).
 *
 * The pea is a BEAD, not a ball: a deep core, a bounce-light rim on the
 * shaded flank (which is what separates glass from plastic), and a soft
 * broad highlight with a small crisp catchlight sitting inside it. Two
 * highlights rather than one is most of the difference — a single fuzzy
 * blob reads as a gumball.
 */

/** The pea's radial material: warm core, lime body, shaded rim. */
export function PeaGradientDef({ id }: { id: string }) {
  return (
    <>
      <radialGradient id={id} cx="32%" cy="27%" r="85%">
        <stop offset="0%" stopColor="#F6FFC2" />
        <stop offset="16%" stopColor="#E4FF6E" />
        <stop offset="46%" stopColor="var(--color-accent)" />
        <stop offset="78%" stopColor="#87AD08" />
        <stop offset="100%" stopColor="#31450A" />
      </radialGradient>
      {/* Bounce light on the shaded flank: the focal point sits up-left,
          so the bright ring gathers at the lower-right rim. */}
      <radialGradient
        id={`${id}-rim`}
        cx="50%"
        cy="50%"
        r="50%"
        fx="26%"
        fy="22%"
      >
        <stop offset="62%" stopColor="rgba(255,255,255,0)" />
        <stop offset="90%" stopColor="rgba(226,255,140,0.28)" />
        <stop offset="100%" stopColor="rgba(240,255,190,0.52)" />
      </radialGradient>
    </>
  );
}

/** A pea drawn at the local origin: body, bounce rim, two highlights. */
export function PeaSprite({
  r,
  gradientId,
  filter,
  circleClassName,
}: {
  r: number;
  gradientId: string;
  filter?: string;
  circleClassName?: string;
}) {
  return (
    <>
      <circle
        r={r}
        fill={`url(#${gradientId})`}
        filter={filter}
        className={circleClassName}
      />
      {/* Light bouncing back into the shaded flank — reads as depth. */}
      <circle r={r} fill={`url(#${gradientId}-rim)`} />
      {/* Broad soft highlight... */}
      <ellipse
        cx={-r * 0.3}
        cy={-r * 0.38}
        rx={r * 0.38}
        ry={r * 0.26}
        fill="#fff"
        opacity="0.22"
        transform={`rotate(-24 ${-r * 0.3} ${-r * 0.38})`}
      />
      {/* ...with a small crisp catchlight sitting inside it. */}
      <ellipse
        cx={-r * 0.34}
        cy={-r * 0.44}
        rx={r * 0.17}
        ry={r * 0.11}
        fill="#fff"
        opacity="0.9"
        transform={`rotate(-24 ${-r * 0.34} ${-r * 0.44})`}
      />
    </>
  );
}
