"use client";

/**
 * The Plinko board — P0 prototype of the pod-drop game surface (flagged
 * RETIRED 2026-07-19: the ?plinko flag is gone and nothing mounts this
 * board. Kept on disk with its tests; VineBoard is the live board.)
 *
 * Anatomy (unit space 1000x846, scales to any width):
 * - THE STALK: a vine rail across the top; a pod hangs from it, sways
 *   while the round runs and RIPENS with the clock (fill tracks time).
 * - THE FIELD: a 16-row peg triangle. Pegs glint as the pea strikes them.
 * - THE ROW: 25 pods (the bet surface), numbered 1..25, showing ETH heat.
 *
 * Settlement: when the VRF result lands (round.winningTile set, phase
 * settling), the stalk travels to its compiled release point, the pod
 * splits, and the pea drops through the field into the winning pod —
 * every frame evaluated from lib/plinko/path.ts as a pure function of
 * (now - endsAt), so mid-joins and throttled tabs render correctly.
 * All per-frame writes are imperative via refs (React style props would
 * be clobbered by the ~3/s engine re-renders — the LAST ROUND lesson).
 * Reduced motion skips the flight: the winner simply ignites and the pea
 * appears seated, with the result announced via a live region.
 */

import { useEffect, useRef, useState } from "react";
import { PeaGradientDef } from "@/components/mine/peaArt";
import {
  BOARD_H,
  BOARD_W,
  compilePath,
  evaluate,
  PEA_R,
  PEG_ROWS,
  pegRowY,
  pegXs,
  POD_COUNT,
  POD_HANG_Y,
  POD_MOUTH_Y,
  POD_REST_Y,
  podX,
  RIPPLE_STEP_MS,
  STALK_HOME_X,
  T_LANDED,
} from "@/lib/plinko/path";
import type { RoundVM, TileId } from "@/lib/types";

interface PlinkoBoardProps {
  round: RoundVM;
  selected: Set<TileId>;
  deployedTiles: TileId[];
  interactive: boolean;
  onToggle(id: TileId, forceOp?: "add" | "remove"): void;
}

const GLINT_MS = 220;

/** Ripening pod fill: client-only 1 Hz leaf (Convention 4 + hydration). */
function useRipen(endsAt: number, durationMs: number): number {
  const [ripen, setRipen] = useState(0);
  useEffect(() => {
    const tick = () =>
      setRipen(
        Math.max(0, Math.min(1, 1 - (endsAt - Date.now()) / durationMs)),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt, durationMs]);
  return ripen;
}

export function PlinkoBoard({
  round,
  selected,
  deployedTiles,
  interactive,
  onToggle,
}: PlinkoBoardProps) {
  const { roundId, winningTile, endsAt, phase } = round;
  const settling = phase !== "active";
  const animating = settling && winningTile !== null;

  // Drag-paint multi-select (same op semantics as the grid).
  const [dragOp, setDragOp] = useState<"add" | "remove" | null>(null);
  const visited = useRef<Set<TileId>>(new Set());

  // Freeze the tiles at settle start so SSE round replacement mid-drop
  // can't reshuffle the heat under the pea (MineGrid's snapshot rule).
  const [frozen, setFrozen] = useState<RoundVM["tiles"] | null>(null);
  const [lastKey, setLastKey] = useState(`${roundId}:${settling}`);
  const key = `${roundId}:${settling}`;
  if (key !== lastKey) {
    // Adjust-state-during-render: never paint a stale frame.
    setLastKey(key);
    setFrozen(settling ? round.tiles : null);
  }
  const tiles = frozen ?? round.tiles;

  // One state flip when the pea lands (a11y announcement + celebration
  // classes); everything per-frame stays imperative.
  const [landed, setLanded] = useState(false);
  if (!settling && landed) setLanded(false);

  const peaRef = useRef<SVGGElement>(null);
  const ghost1Ref = useRef<SVGGElement>(null);
  const ghost2Ref = useRef<SVGGElement>(null);
  const stalkRef = useRef<SVGGElement>(null);
  const podLeftRef = useRef<SVGPathElement>(null);
  const podRightRef = useRef<SVGPathElement>(null);
  const glintRefs = useRef<Map<string, SVGCircleElement>>(new Map());
  const slotRefs = useRef<Map<number, SVGGElement>>(new Map());

  const ripen = useRipen(endsAt, 60_000);

  // ── The drop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!animating || winningTile === null) return;
    const path = compilePath(winningTile, roundId);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const pea = peaRef.current;
    const stalk = stalkRef.current;
    if (!pea || !stalk) return;

    const applyPodStates = (elapsed: number) => {
      for (let i = 0; i < POD_COUNT; i++) {
        const node = slotRefs.current.get(i);
        if (!node) continue;
        if (i === winningTile) {
          node.style.opacity = "1";
          continue;
        }
        const delay = Math.abs(i - winningTile) * RIPPLE_STEP_MS;
        node.style.opacity = elapsed >= T_LANDED + delay ? "0.28" : "1";
      }
    };

    if (reduced) {
      // No flight: seat the pea, ignite, announce.
      pea.setAttribute(
        "transform",
        `translate(${podX(winningTile)} ${POD_REST_Y})`,
      );
      pea.style.opacity = "1";
      stalk.setAttribute("transform", `translate(${STALK_HOME_X} 0)`);
      applyPodStates(Number.POSITIVE_INFINITY);
      setLanded(true);
      return;
    }

    let raf = 0;
    let announced = false;
    // The landed flip must not DEPEND on rAF (hidden tabs suspend it):
    // a clock-anchored timeout guarantees the celebration state + a11y
    // announcement land even if no frame ever runs.
    const landTimer = setTimeout(
      () => setLanded(true),
      Math.max(0, endsAt + T_LANDED - Date.now()),
    );
    const tick = () => {
      const elapsed = Date.now() - endsAt;
      const f = evaluate(path, elapsed);

      pea.setAttribute(
        "transform",
        `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${f.scaleX.toFixed(3)} ${f.scaleY.toFixed(3)})`,
      );
      pea.style.opacity = f.peaVisible ? "1" : "0";

      // Motion trail: two ghosts a few frames behind (pure re-evaluation,
      // so the trail is as deterministic as the pea). Hidden once settled.
      const inFlight = f.peaVisible && !f.settled;
      for (const [ref, lag, op] of [
        [ghost1Ref, 45, 0.22],
        [ghost2Ref, 90, 0.1],
      ] as const) {
        const node = ref.current;
        if (!node) continue;
        if (!inFlight) {
          node.style.opacity = "0";
          continue;
        }
        const g = evaluate(path, elapsed - lag);
        node.setAttribute(
          "transform",
          `translate(${g.x.toFixed(1)} ${g.y.toFixed(1)})`,
        );
        node.style.opacity = g.peaVisible ? String(op) : "0";
      }

      stalk.setAttribute("transform", `translate(${f.stalkX.toFixed(1)} 0)`);
      const open = 42 * f.podOpen;
      podLeftRef.current?.setAttribute(
        "transform",
        `rotate(${-open} 0 ${POD_HANG_Y - 26})`,
      );
      podRightRef.current?.setAttribute(
        "transform",
        `rotate(${open} 0 ${POD_HANG_Y - 26})`,
      );

      for (const imp of path.impacts) {
        if (imp.row === null) continue;
        const node = glintRefs.current.get(`${imp.row}:${imp.x}`);
        if (!node) continue;
        const d = elapsed - imp.t;
        node.style.opacity =
          d >= 0 && d < GLINT_MS ? String(1 - d / GLINT_MS) : "0";
      }

      applyPodStates(elapsed);
      if (!announced && elapsed >= T_LANDED) {
        announced = true;
        setLanded(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(landTimer);
    };
  }, [animating, winningTile, roundId, endsAt]);

  // Fresh round: put every imperative node back to its idle pose before
  // paint (the state resets above ran during render).
  useEffect(() => {
    if (settling) return;
    peaRef.current?.style.setProperty("opacity", "0");
    ghost1Ref.current?.style.setProperty("opacity", "0");
    ghost2Ref.current?.style.setProperty("opacity", "0");
    stalkRef.current?.setAttribute("transform", `translate(${STALK_HOME_X} 0)`);
    podLeftRef.current?.setAttribute("transform", "rotate(0)");
    podRightRef.current?.setAttribute("transform", "rotate(0)");
    for (const node of glintRefs.current.values()) node.style.opacity = "0";
    for (const node of slotRefs.current.values()) node.style.opacity = "1";
  }, [settling, roundId]);

  const maxEth = Math.max(...tiles.map((t) => t.eth), 0.000001);

  const endDrag = () => {
    setDragOp(null);
    visited.current.clear();
  };

  return (
    <div className="w-full select-none">
      {/* Width is double-capped: the pane's width AND the viewport height
          (aspect-locked, so height = width * H/W) — the pod row must
          always sit ABOVE the fold with breathing room, on any screen. */}
      <div
        className="relative mx-auto w-full"
        style={{
          aspectRatio: `${BOARD_W} / ${BOARD_H}`,
          maxWidth: `calc((100dvh - 160px) * ${(BOARD_W / BOARD_H).toFixed(4)})`,
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <svg
          viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <PeaGradientDef id="pk-pea" />
            {/* Peg stud: small machined dome catching light top-left. */}
            <radialGradient id="pk-peg" cx="34%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#6B7D30" />
              <stop offset="45%" stopColor="#39461A" />
              <stop offset="100%" stopColor="#121707" />
            </radialGradient>
            {/* Pod skin: deep organic lime with a lit edge. */}
            <linearGradient id="pk-pod" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2C3A0C" />
              <stop offset="55%" stopColor="#1A2405" />
              <stop offset="100%" stopColor="#0D1202" />
            </linearGradient>
            {/* Socket interior: faint depth falling away from the mouth. */}
            <linearGradient id="pk-socket" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.045)" />
              <stop offset="30%" stopColor="rgba(255,255,255,0.012)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
            {/* Winner ignition wash rising from the socket floor. */}
            <linearGradient id="pk-ignite" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(204,255,0,0.30)" />
              <stop offset="70%" stopColor="rgba(204,255,0,0.05)" />
              <stop offset="100%" stopColor="rgba(204,255,0,0)" />
            </linearGradient>
            <filter id="pk-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="pk-soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Ambient depth behind the field — no frame, just atmosphere. */}
          <radialGradient id="pk-ambient" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="rgba(204,255,0,0.04)" />
            <stop offset="60%" stopColor="rgba(204,255,0,0.008)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <rect x="0" y="0" width={BOARD_W} height={BOARD_H} fill="url(#pk-ambient)" />

          {/* The vine the stalk hangs from: one quiet hairline. */}
          <line
            x1="0"
            y1="8"
            x2={BOARD_W}
            y2="8"
            stroke="var(--color-line-faint)"
            strokeWidth="1.5"
          />

          {/* ── The stalk: curling vine, leaf pair, hanging pod ── */}
          <g ref={stalkRef} transform={`translate(${STALK_HOME_X} 0)`}>
            <g className={settling ? "" : "plinko-sway"}>
              {/* Vine: a drawn curl, thick to thin. */}
              <path
                d={`M0 8 C 10 22 -12 40 -2 56 C 4 66 -4 74 0 ${POD_HANG_Y - 34}`}
                fill="none"
                stroke="#3A521A"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d={`M0 8 C 10 22 -12 40 -2 56 C 4 66 -4 74 0 ${POD_HANG_Y - 34}`}
                fill="none"
                stroke="#5C7A2A"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.7"
              />
              {/* Leaf pair at the pod stem, veined. */}
              <g transform={`translate(0 ${POD_HANG_Y - 40})`}>
                <path
                  d="M2 0 C 20 -14 40 -12 46 2 C 32 10 12 10 2 0 Z"
                  fill="url(#pk-pod)"
                  stroke="#4E6B22"
                  strokeWidth="1.4"
                />
                <path d="M4 0 C 20 -6 34 -4 44 1" fill="none" stroke="#5C7A2A" strokeWidth="1" opacity="0.7" />
                <path
                  d="M-2 4 C -20 -8 -38 -4 -42 8 C -28 16 -10 14 -2 4 Z"
                  fill="url(#pk-pod)"
                  stroke="#4E6B22"
                  strokeWidth="1.4"
                />
                <path d="M-4 4 C -18 0 -30 2 -40 8" fill="none" stroke="#5C7A2A" strokeWidth="1" opacity="0.7" />
              </g>
              {/* Ripening bloom behind the pod (grows toward 00:00). */}
              <circle
                cx="0"
                cy={POD_HANG_Y}
                r={30 + ripen * 16}
                fill="var(--color-accent)"
                opacity={0.05 + ripen * ripen * 0.16}
                filter="url(#pk-glow)"
              />
              {/* Peas inside the seam, brightening as the pod ripens. */}
              {[-13, 0, 13].map((dy, k) => (
                <circle
                  key={k}
                  cx="0"
                  cy={POD_HANG_Y + dy}
                  r={4.6 + ripen * 1.8}
                  fill="url(#pk-pea)"
                  opacity={0.35 + ripen * 0.65}
                />
              ))}
              {/* Pod halves: crescents that split on release. */}
              <path
                ref={podLeftRef}
                d={`M0 ${POD_HANG_Y - 30}
                    C -17 ${POD_HANG_Y - 22} -22 ${POD_HANG_Y - 6} -20 ${POD_HANG_Y + 6}
                    C -18 ${POD_HANG_Y + 20} -10 ${POD_HANG_Y + 28} 0 ${POD_HANG_Y + 30}
                    C -6 ${POD_HANG_Y + 16} -6 ${POD_HANG_Y - 16} 0 ${POD_HANG_Y - 30} Z`}
                fill="url(#pk-pod)"
                stroke="#87AD08"
                strokeWidth="1.6"
              />
              <path
                ref={podRightRef}
                d={`M0 ${POD_HANG_Y - 30}
                    C 17 ${POD_HANG_Y - 22} 22 ${POD_HANG_Y - 6} 20 ${POD_HANG_Y + 6}
                    C 18 ${POD_HANG_Y + 20} 10 ${POD_HANG_Y + 28} 0 ${POD_HANG_Y + 30}
                    C 6 ${POD_HANG_Y + 16} 6 ${POD_HANG_Y - 16} 0 ${POD_HANG_Y - 30} Z`}
                fill="url(#pk-pod)"
                stroke="#87AD08"
                strokeWidth="1.6"
              />
              {/* Stem connecting vine to pod. */}
              <path
                d={`M0 ${POD_HANG_Y - 34} q 3 2 0 8`}
                fill="none"
                stroke="#5C7A2A"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          </g>

          {/* ── The field: machined peg studs + strike glints ── */}
          {Array.from({ length: PEG_ROWS }, (_, r) =>
            pegXs(r).map((x) => (
              <g key={`${r}:${x}`}>
                <circle
                  cx={x}
                  cy={pegRowY(r)}
                  r="7"
                  fill="url(#pk-peg)"
                  stroke="#3A421C"
                  strokeWidth="1"
                  data-peg
                />
                <circle
                  cx={x - 2}
                  cy={pegRowY(r) - 2.2}
                  r="1.8"
                  fill="#fff"
                  opacity="0.42"
                />
                <circle
                  ref={(n) => {
                    if (n) glintRefs.current.set(`${r}:${x}`, n);
                  }}
                  cx={x}
                  cy={pegRowY(r)}
                  r="9"
                  fill="var(--color-accent)"
                  opacity="0"
                  filter="url(#pk-glow)"
                />
              </g>
            )),
          )}

          {/* ── The row: 25 identical pill pods, a slight gap between
              neighbours, numbered inside ── */}
          {tiles.map((tile, i) => {
            const x = podX(i);
            const isSel = selected.has(i as TileId);
            const isDeployed = deployedTiles.includes(i as TileId);
            const isWinner = landed && winningTile === i;
            return (
              <g
                key={i}
                ref={(n) => {
                  if (n) slotRefs.current.set(i, n);
                }}
              >
                {/* Open-top pill: every pod is the SAME shape and weight;
                    states change only the stroke color. */}
                <path
                  d={`M${x - 17} ${POD_MOUTH_Y}
                      L${x - 17} ${POD_MOUTH_Y + 105}
                      Q${x - 17} ${POD_MOUTH_Y + 122} ${x - 3} ${POD_MOUTH_Y + 122}
                      L${x + 3} ${POD_MOUTH_Y + 122}
                      Q${x + 17} ${POD_MOUTH_Y + 122} ${x + 17} ${POD_MOUTH_Y + 105}
                      L${x + 17} ${POD_MOUTH_Y}`}
                  fill="url(#pk-socket)"
                  stroke={
                    isWinner || isSel
                      ? "var(--color-accent)"
                      : isDeployed
                        ? "#B7E62E"
                        : "#8FB808"
                  }
                  strokeWidth="2.4"
                  opacity={isWinner || isSel ? 1 : 0.9}
                  filter={isWinner ? "url(#pk-soft)" : undefined}
                />
                {isWinner && (
                  <path
                    d={`M${x - 15} ${POD_MOUTH_Y} L${x - 15} ${POD_MOUTH_Y + 118} L${x + 15} ${POD_MOUTH_Y + 118} L${x + 15} ${POD_MOUTH_Y} Z`}
                    fill="url(#pk-ignite)"
                  />
                )}
                {isSel && !isWinner && (
                  <path
                    d={`M${x - 15} ${POD_MOUTH_Y + 50} L${x - 15} ${POD_MOUTH_Y + 118} L${x + 15} ${POD_MOUTH_Y + 118} L${x + 15} ${POD_MOUTH_Y + 50} Z`}
                    fill="url(#pk-ignite)"
                    opacity="0.5"
                  />
                )}
                {isDeployed && !isWinner && (
                  <circle cx={x} cy={POD_MOUTH_Y + 12} r="2.6" fill="#87AD08" />
                )}
                <text
                  x={x}
                  y={POD_MOUTH_Y + 92}
                  textAnchor="middle"
                  fontSize="16.5"
                  fill={
                    isWinner
                      ? "var(--color-accent)"
                      : isSel
                        ? "var(--color-fg)"
                        : "var(--color-fg-body)"
                  }
                  fontWeight={isSel || isWinner ? 700 : 300}
                  className="tnum"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}

          {/* Grounding hairline beneath the socket row. */}
          <line
            x1="6"
            y1={POD_MOUTH_Y + 130}
            x2={BOARD_W - 6}
            y2={POD_MOUTH_Y + 130}
            stroke="var(--color-line-faint)"
            strokeWidth="1.5"
          />

          {/* ── The pea (+ two ghost trails during flight) ── */}
          <g ref={ghost2Ref} opacity="0">
            <circle r={PEA_R * 0.86} fill="url(#pk-pea)" />
          </g>
          <g ref={ghost1Ref} opacity="0">
            <circle r={PEA_R * 0.93} fill="url(#pk-pea)" />
          </g>
          <g ref={peaRef} opacity="0" data-pea>
            <circle r={PEA_R} fill="url(#pk-pea)" filter="url(#pk-soft)" />
            <ellipse
              cx={-PEA_R * 0.32}
              cy={-PEA_R * 0.4}
              rx={PEA_R * 0.34}
              ry={PEA_R * 0.2}
              fill="#fff"
              opacity="0.55"
              transform={`rotate(-24 ${-PEA_R * 0.32} ${-PEA_R * 0.4})`}
            />
            <circle cx={PEA_R * 0.18} cy={PEA_R * 0.1} r={PEA_R * 0.82} fill="none" stroke="#2A3900" strokeWidth="1" opacity="0.35" />
          </g>
        </svg>

        {/* Bet targets: real buttons over the pod row (full column height
            for a generous hit area), drag-paint like the grid. */}
        <div
          className="absolute inset-x-0 flex"
          style={{ top: "22%", bottom: 0 }}
          role="group"
          aria-label="Choose pods"
        >
          {tiles.map((tile, i) => {
            const isSel = selected.has(i as TileId);
            return (
              <button
                key={i}
                type="button"
                disabled={!interactive}
                aria-pressed={isSel}
                aria-label={`Pod ${i + 1}, ${tile.ethFormatted} ETH deployed`}
                className="focus-ring min-w-0 flex-1 cursor-pointer touch-none rounded disabled:cursor-default"
                onPointerDown={(e) => {
                  if (!interactive) return;
                  e.preventDefault();
                  const op = isSel ? "remove" : "add";
                  setDragOp(op);
                  visited.current = new Set([i as TileId]);
                  onToggle(i as TileId, op);
                }}
                onPointerEnter={() => {
                  if (!interactive || dragOp === null) return;
                  if (visited.current.has(i as TileId)) return;
                  visited.current.add(i as TileId);
                  onToggle(i as TileId, dragOp);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle(i as TileId);
                  }
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Result announcement for assistive tech. */}
      <span aria-live="polite" className="sr-only">
        {landed && winningTile !== null
          ? `Pod ${winningTile + 1} wins the round.`
          : ""}
      </span>
    </div>
  );
}
